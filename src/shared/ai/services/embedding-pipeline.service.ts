import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { posts } from "../../../db/schema/posts";
import { postEmbeddings } from "../../../db/schema/post-embeddings";
import { chunkingService } from "./chunking.service";
import { textEmbeddingService } from "./text-embedding.service";
import logger from "../../../config/logger";

export class EmbeddingPipelineService {
  /**
   * Full pipeline for one post: fetch → build → chunk → embed → persist.
   * Idempotent — deletes existing embeddings first.
   */
  async processPost(postId: string): Promise<{ chunks: number }> {
    const post = await this.fetchPost(postId);
    if (!post) {
      logger.warn(`Embedding pipeline: post not found (postId: ${postId})`);
      return { chunks: 0 };
    }

    // Skip non-publishable states
    if (post.status !== "published") {
      logger.debug(
        `Skipping embedding for non-published post (postId: ${postId}, status: ${post.status})`
      );
      await this.deleteForPost(postId);
      return { chunks: 0 };
    }

    const embeddableText = this.buildEmbeddableText(post);
    const chunks = chunkingService.chunk(embeddableText);

    if (chunks.length === 0) {
      logger.warn(`No chunks produced (postId: ${postId})`);
      await this.deleteForPost(postId);
      return { chunks: 0 };
    }

    // Prepend title to every chunk so the embedding has topical context.
    // We still store only the raw chunkText for display.
    const textsToEmbed = chunks.map((c) => `${post.title}\n\n${c.text}`);

    const vectors = await textEmbeddingService.embedTexts(textsToEmbed);

    await db.transaction(async (tx) => {
      await tx.delete(postEmbeddings).where(eq(postEmbeddings.postId, postId));

      await tx.insert(postEmbeddings).values(
        chunks.map((chunk, i) => ({
          postId,
          chunkIndex: chunk.index,
          chunkText: chunk.text,
          embedding: vectors[i],
        }))
      );
    });

    logger.info(
      `Embedding pipeline completed (postId: ${postId}, chunks: ${chunks.length})`
    );
    return { chunks: chunks.length };
  }

  async deleteForPost(postId: string): Promise<void> {
    await db.delete(postEmbeddings).where(eq(postEmbeddings.postId, postId));
  }

  // ---------------- internals ----------------

  private async fetchPost(postId: string) {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    return post ?? null;
  }

  private buildEmbeddableText(post: {
    title: string;
    subtitle?: string | null;
    excerpt?: string | null;
    tags?: string[] | null;
    content: string;
  }): string {
    const parts: string[] = [post.title];

    if (post.subtitle) parts.push(post.subtitle);
    if (post.excerpt) parts.push(post.excerpt);
    if (post.tags && post.tags.length > 0) {
      parts.push(`Tags: ${post.tags.join(", ")}`);
    }
    parts.push(post.content);

    return parts.join("\n\n");
  }
}

export const embeddingPipelineService = new EmbeddingPipelineService();