import { and, eq, gte, lte, sql, inArray, desc, or, ilike } from "drizzle-orm";
import { db } from "../../../db";
import { posts } from "../../../db/schema/posts";
import { users } from "../../../db/schema/users";
import { postEmbeddings } from "../../../db/schema/post-embeddings";
import { textEmbeddingService } from "../../../shared/ai/services/text-embedding.service";
import { rrfService } from "./rrf.service";
import type {
  SearchOptions,
  SearchResult,
  VectorSearchRow,
  LexicalSearchRow,
  FusedResult,
} from "../interfaces/search.interface";
import logger from "../../../config/logger";

export class SearchService {
  async searchPosts(options: SearchOptions): Promise<SearchResult[]> {
    const startTime = Date.now();

    // ---------- 1. Vector search ----------
    const queryVector = await textEmbeddingService.embedText(options.query);
    const vectorRows = await this.vectorSearch(queryVector, options);

    // ---------- 2. Lexical search ----------
    const lexicalRows = await this.lexicalSearch(options);

    // ---------- 3. Fuse with RRF ----------
    const fused = rrfService.fuse([
      vectorRows.map((r) => ({ postId: r.postId, matchedChunk: r.chunkText })),
      lexicalRows.map((r) => ({ postId: r.postId })),
    ]);

    if (fused.length === 0) return [];

    // ---------- 4. Take top N, hydrate with full post details ----------
    const topIds = fused.slice(0, options.limit).map((f) => f.postId);
    const hydrated = await this.hydrate(topIds);

    // Merge metadata (score, matchedChunk) with post details
    const result = topIds
      .map((id) => {
        const post = hydrated.get(id);
        const fusedMeta = fused.find((f) => f.postId === id);
        if (!post || !fusedMeta) return null;
        return {
          ...post,
          score: fusedMeta.score,
          matchedChunk: fusedMeta.matchedChunk ?? null,
        } as SearchResult;
      })
      .filter((r): r is SearchResult => r !== null);

    logger.info(
      "Search completed",
      {
        query: options.query,
        vectorHits: vectorRows.length,
        lexicalHits: lexicalRows.length,
        fused: fused.length,
        returned: result.length,
        elapsedMs: Date.now() - startTime,
      }
    );

    return result;
  }

  // ---------------- vector search ----------------

  private async vectorSearch(
    queryVector: number[],
    options: SearchOptions
  ): Promise<VectorSearchRow[]> {
    // Note: pgvector cosine distance operator is <=>
    // Similarity = 1 - distance
    const vectorLiteral = `[${queryVector.join(",")}]`;
    const topK = Math.max(options.limit * 3, 30); // over-fetch for fusion

    const rows = await db
      .select({
        postId: postEmbeddings.postId,
        chunkText: postEmbeddings.chunkText,
        chunkIndex: postEmbeddings.chunkIndex,
        similarity: sql<number>`1 - (${postEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
      })
      .from(postEmbeddings)
      .innerJoin(posts, eq(posts.id, postEmbeddings.postId))
      .where(
        and(
          eq(posts.status, "published"),
          options.authorId ? eq(posts.authorId, options.authorId) : undefined,
          options.fromDate ? gte(posts.publishDate, options.fromDate) : undefined,
          options.toDate ? lte(posts.publishDate, options.toDate) : undefined
        )
      )
      .orderBy(sql`${postEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`)
      .limit(topK);

    // Dedupe by postId — keep the best-scoring chunk per post
    const byPost = new Map<string, VectorSearchRow>();
    for (const row of rows) {
      const existing = byPost.get(row.postId);
      if (!existing || row.similarity > existing.similarity) {
        byPost.set(row.postId, row);
      }
    }

    return Array.from(byPost.values()).sort((a, b) => b.similarity - a.similarity);
  }

  // ---------------- lexical search ----------------

  private async lexicalSearch(
    options: SearchOptions
  ): Promise<LexicalSearchRow[]> {
    const pattern = `%${options.query}%`;
    const topK = Math.max(options.limit * 3, 30);

    const rows = await db
      .select({
        postId: posts.id,
        // Simple ranking: match in title beats match in content
        rank: sql<number>`
          CASE
            WHEN ${posts.title} ILIKE ${pattern} THEN 100
            WHEN ${posts.excerpt} ILIKE ${pattern} THEN 50
            ELSE 10
          END
        `,
      })
      .from(posts)
      .where(
        and(
          eq(posts.status, "published"),
          or(
            ilike(posts.title, pattern),
            ilike(posts.subtitle, pattern),
            ilike(posts.excerpt, pattern),
            ilike(posts.content, pattern)
          ),
          options.authorId ? eq(posts.authorId, options.authorId) : undefined,
          options.fromDate ? gte(posts.publishDate, options.fromDate) : undefined,
          options.toDate ? lte(posts.publishDate, options.toDate) : undefined
        )
      )
      .orderBy(desc(sql`
        CASE
          WHEN ${posts.title} ILIKE ${pattern} THEN 100
          WHEN ${posts.excerpt} ILIKE ${pattern} THEN 50
          ELSE 10
        END
      `))
      .limit(topK);

    return rows;
  }

  // ---------------- hydration ----------------

  private async hydrate(postIds: string[]): Promise<Map<string, Omit<SearchResult, "score" | "matchedChunk">>> {
    if (postIds.length === 0) return new Map();

    const rows = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        subtitle: posts.subtitle,
        excerpt: posts.excerpt,
        coverImageUrl: posts.coverImageUrl,
        tags: posts.tags,
        readTime: posts.readTime,
        publishDate: posts.publishDate,
        authorId: users.id,
        authorUsername: users.username,
        authorFullname: users.fullname,
        authorProfileImageUrl: users.profileImageUrl,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(inArray(posts.id, postIds));

    const map = new Map<string, Omit<SearchResult, "score" | "matchedChunk">>();
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        title: r.title,
        slug: r.slug,
        subtitle: r.subtitle,
        excerpt: r.excerpt,
        coverImageUrl: r.coverImageUrl,
        tags: r.tags,
        readTime: r.readTime,
        publishDate: r.publishDate,
        author: {
          id: r.authorId,
          username: r.authorUsername,
          fullname: r.authorFullname,
          profileImageUrl: r.authorProfileImageUrl,
        },
      });
    }
    return map;
  }
}

export const searchService = new SearchService();