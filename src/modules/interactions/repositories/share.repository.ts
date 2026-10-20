import { and, desc, eq, lt,sql } from "drizzle-orm";

import { db } from "../../../db";
import { posts, shares } from "../../../db/schema";

export class ShareRepository {
  async createShare(userId: string, postId: string, platform: string) {
    return db.transaction(async (tx) => {
      const result = await tx
        .insert(shares)
        .values({
          userId,
          postId,
          platform,
        })
        .returning();

      const share = result[0] ?? null;

      if (!share) return null;

      await tx
        .update(posts)
        .set({ shareCount: sql`${posts.shareCount} + 1` })
        .where(eq(posts.id, postId));

      return share;
    });
  }

  async getShareById(id: number) {
    const result = await db
      .select()
      .from(shares)
      .where(eq(shares.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  async getPostShares(postId: string, limit: number, cursor?: Date) {
    const conditions = cursor
      ? and(eq(shares.postId, postId), lt(shares.createdAt, cursor))
      : eq(shares.postId, postId);

    return db
      .select({
        id: shares.id,
        userId: shares.userId,
        postId: shares.postId,
        platform: shares.platform,
        createdAt: shares.createdAt,
      })
      .from(shares)
      .where(conditions)
      .orderBy(desc(shares.createdAt))
      .limit(limit);
  }

  async getUserPostShares(userId: string, postId: string) {
    return db
      .select({
        id: shares.id,
        userId: shares.userId,
        postId: shares.postId,
        platform: shares.platform,
        createdAt: shares.createdAt,
      })
      .from(shares)
      .where(and(eq(shares.userId, userId), eq(shares.postId, postId)))
      .orderBy(desc(shares.createdAt));
  }
}

export const shareRepository = new ShareRepository();
