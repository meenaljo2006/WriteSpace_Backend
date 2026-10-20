import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../db";
import { comments,commentReactions, posts, postReactions, } from "../../../db/schema";
import type { ReactionType } from "../contracts/reaction.types";

export class ReactionRepository {
  async findPostReaction(postId: string, userId: string) {
    const result = await db
      .select({
        postId: postReactions.postId,
        userId: postReactions.userId,
        reactionType: postReactions.reactionType,
      })
      .from(postReactions)
      .where(
        and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)),
      )
      .limit(1);

    return result[0] ?? null;
  }

  async findCommentReaction(commentId: string, userId: string) {
    const result = await db
      .select({
        commentId: commentReactions.commentId,
        userId: commentReactions.userId,
        reactionType: commentReactions.reactionType,
      })
      .from(commentReactions)
      .where(
        and(
          eq(commentReactions.commentId, commentId),
          eq(commentReactions.userId, userId),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  async setPostReaction(
    postId: string,
    userId: string,
    reactionType: ReactionType,
  ) {
    return db.transaction(async (tx) => {
      let previousReactionType: ReactionType | null = null;
      let reaction: typeof postReactions.$inferSelect | undefined;

      const existing = await tx
        .select({
          reactionType: postReactions.reactionType,
        })
        .from(postReactions)
        .where(
          and(
            eq(postReactions.postId, postId),
            eq(postReactions.userId, userId),
          ),
        )
        .for("update")
        .limit(1);

      if (existing.length > 0) {
        previousReactionType = existing[0].reactionType;

        if (previousReactionType === reactionType) {
          return { previousReactionType, reaction: existing[0] };
        }

        const updated = await tx
          .update(postReactions)
          .set({ reactionType, updatedAt: new Date() })
          .where(
            and(
              eq(postReactions.postId, postId),
              eq(postReactions.userId, userId),
            ),
          )
          .returning();

        reaction = updated[0];
      } else {
        const inserted = await tx
          .insert(postReactions)
          .values({ postId, userId, reactionType })
          .onConflictDoNothing({
            target: [postReactions.postId, postReactions.userId],
          })
          .returning();

        if (inserted.length > 0) {
          reaction = inserted[0];
          previousReactionType = null;
        } else {
          const concurrent = await tx
            .select({ reactionType: postReactions.reactionType })
            .from(postReactions)
            .where(
              and(
                eq(postReactions.postId, postId),
                eq(postReactions.userId, userId),
              ),
            )
            .for("update")
            .limit(1);

          previousReactionType = concurrent[0]?.reactionType ?? null;

          if (previousReactionType === reactionType) {
            return { previousReactionType, reaction: concurrent[0] };
          }

          const updated = await tx
            .update(postReactions)
            .set({ reactionType, updatedAt: new Date() })
            .where(
              and(
                eq(postReactions.postId, postId),
                eq(postReactions.userId, userId),
              ),
            )
            .returning();

          reaction = updated[0];
        }
      }

      const likeDelta =
        (previousReactionType === "like" ? -1 : 0) +
        (reactionType === "like" ? 1 : 0);

      if (likeDelta !== 0) {
        await tx
          .update(posts)
          .set({
            likeCount: sql`GREATEST(${posts.likeCount} + ${likeDelta}, 0)`,
          })
          .where(eq(posts.id, postId));
      }

      return { previousReactionType, reaction };
    });
  }

  async setCommentReaction(
    commentId: string,
    userId: string,
    reactionType: ReactionType,
  ) {
    return db.transaction(async (tx) => {
      let previousReactionType: ReactionType | null = null;
      let reaction: typeof commentReactions.$inferSelect | undefined;

      const existing = await tx
        .select({
          reactionType: commentReactions.reactionType,
        })
        .from(commentReactions)
        .where(
          and(
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.userId, userId),
          ),
        )
        .for("update")
        .limit(1);

      if (existing.length > 0) {
        previousReactionType = existing[0].reactionType;

        if (previousReactionType === reactionType) {
          return { previousReactionType, reaction: existing[0] };
        }

        const updated = await tx
          .update(commentReactions)
          .set({ reactionType, updatedAt: new Date() })
          .where(
            and(
              eq(commentReactions.commentId, commentId),
              eq(commentReactions.userId, userId),
            ),
          )
          .returning();

        reaction = updated[0];
      } else {
        const inserted = await tx
          .insert(commentReactions)
          .values({ commentId, userId, reactionType })
          .onConflictDoNothing({
            target: [commentReactions.commentId, commentReactions.userId],
          })
          .returning();

        if (inserted.length > 0) {
          reaction = inserted[0];
          previousReactionType = null;
        } else {
          const concurrent = await tx
            .select({ reactionType: commentReactions.reactionType })
            .from(commentReactions)
            .where(
              and(
                eq(commentReactions.commentId, commentId),
                eq(commentReactions.userId, userId),
              ),
            )
            .for("update")
            .limit(1);

          previousReactionType = concurrent[0]?.reactionType ?? null;

          if (previousReactionType === reactionType) {
            return { previousReactionType, reaction: concurrent[0] };
          }

          const updated = await tx
            .update(commentReactions)
            .set({ reactionType, updatedAt: new Date() })
            .where(
              and(
                eq(commentReactions.commentId, commentId),
                eq(commentReactions.userId, userId),
              ),
            )
            .returning();

          reaction = updated[0];
        }
      }

      const likeDelta =
        (previousReactionType === "like" ? -1 : 0) +
        (reactionType === "like" ? 1 : 0);

      if (likeDelta !== 0) {
        await tx
          .update(comments)
          .set({
            likeCount: sql`GREATEST(${comments.likeCount} + ${likeDelta}, 0)`,
          })
          .where(eq(comments.id, commentId));
      }

      return { previousReactionType, reaction };
    });
  }

  async deletePostReaction(postId: string, userId: string) {
    return db.transaction(async (tx) => {
      const result = await tx
        .delete(postReactions)
        .where(
          and(
            eq(postReactions.postId, postId),
            eq(postReactions.userId, userId),
          ),
        )
        .returning();

      const row = result[0] ?? null;

      if (!row) return null;

      if (row.reactionType === "like") {
        await tx
          .update(posts)
          .set({
            likeCount: sql`GREATEST(${posts.likeCount} - 1, 0)`,
          })
          .where(eq(posts.id, postId));
      }

      return row;
    });
  }

  async deleteCommentReaction(commentId: string, userId: string) {
    return db.transaction(async (tx) => {
      const result = await tx
        .delete(commentReactions)
        .where(
          and(
            eq(commentReactions.commentId, commentId),
            eq(commentReactions.userId, userId),
          ),
        )
        .returning();

      const row = result[0] ?? null;

      if (!row) return null;

      if (row.reactionType === "like") {
        await tx
          .update(comments)
          .set({
            likeCount: sql`GREATEST(${comments.likeCount} - 1, 0)`,
          })
          .where(eq(comments.id, commentId));
      }

      return row;
    });
  }

  async getPostReactionCounts(postId: string) {
    return db
      .select({
        reactionType: postReactions.reactionType,
        count: sql<number>`count(*)::int`,
      })
      .from(postReactions)
      .where(eq(postReactions.postId, postId))
      .groupBy(postReactions.reactionType);
  }

  async getCommentReactionCounts(commentId: string) {
    return db
      .select({
        reactionType: commentReactions.reactionType,
        count: sql<number>`count(*)::int`,
      })
      .from(commentReactions)
      .where(eq(commentReactions.commentId, commentId))
      .groupBy(commentReactions.reactionType);
  }
}

export const reactionRepository = new ReactionRepository();
