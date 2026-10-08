/**
 * Backfill embeddings for existing posts.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-embeddings.ts                # all published posts
 *   npx tsx src/scripts/backfill-embeddings.ts --limit=100    # cap at 100
 *   npx tsx src/scripts/backfill-embeddings.ts --force        # re-embed even if already embedded
 *
 * What it does:
 *   1. Fetches post IDs (published only, unless --force)
 *   2. Enqueues one BullMQ job per post (batched, with a small delay)
 *   3. Exits — the worker running in your server process picks them up
 *
 * Important: your server must be running (or the worker process must be
 * running separately) for the queue to actually drain.
 */

import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { posts } from "../db/schema/posts";
import { postEmbeddings } from "../db/schema/post-embeddings";
import { enqueueEmbedPost } from "../shared/queues/embedding.queue";
import logger from "../config/logger";

interface Args {
  limit?: number;
  force: boolean;
  batchDelayMs: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { force: false, batchDelayMs: 50 };

  for (const arg of args) {
    if (arg === "--force") out.force = true;
    else if (arg.startsWith("--limit=")) {
      out.limit = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--delay=")) {
      out.batchDelayMs = parseInt(arg.split("=")[1], 10);
    }
  }

  return out;
}

async function main() {
  const args = parseArgs();

  console.log("🚀 Backfilling embeddings...\n");
  console.log(`   force:   ${args.force}`);
  console.log(`   limit:   ${args.limit ?? "unlimited"}`);
  console.log(`   delay:   ${args.batchDelayMs}ms between jobs\n`);

  // Fetch published post IDs
  const candidates = await db
    .select({ id: posts.id })
    .from(posts)
    .where(sql`${posts.status} = 'published'`);

  let postIds = candidates.map((p) => p.id);

  // If not forcing, skip posts that already have embeddings
  if (!args.force) {
    const alreadyEmbedded = await db
      .selectDistinct({ postId: postEmbeddings.postId })
      .from(postEmbeddings);
    const embeddedSet = new Set(alreadyEmbedded.map((r) => r.postId));

    const before = postIds.length;
    postIds = postIds.filter((id) => !embeddedSet.has(id));
    console.log(
      `   Skipping ${before - postIds.length} posts that already have embeddings.\n`
    );
  }

  if (args.limit) postIds = postIds.slice(0, args.limit);

  if (postIds.length === 0) {
    console.log("✅ Nothing to backfill. All posts are up to date.\n");
    return;
  }

  console.log(`📋 Enqueuing ${postIds.length} jobs...\n`);

  let enqueued = 0;
  for (const postId of postIds) {
    await enqueueEmbedPost(postId, "manual");
    enqueued++;

    if (enqueued % 100 === 0) {
      console.log(`   ... ${enqueued}/${postIds.length} enqueued`);
    }

    // gentle throttling so we don't overwhelm Redis
    if (args.batchDelayMs > 0) {
      await new Promise((r) => setTimeout(r, args.batchDelayMs));
    }
  }

  console.log(`\nEnqueued ${enqueued} embedding jobs.`);
  console.log(
    `   The worker will process them in the background.\n` +
      `   Monitor progress in your server logs (look for "Embedding pipeline completed").\n`
  );

  logger.info("Embedding backfill enqueued", { enqueued });
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Backfill failed:", err);
    pool.end().finally(() => process.exit(1));
  });