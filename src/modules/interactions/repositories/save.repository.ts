import { and, desc, eq, lt, sql, SQL } from "drizzle-orm";

import { db } from "../../../db";
import {
  follows,
  postReactions,
  posts,
  postSaves,
  users,
} from "../../../db/schema";

export class SaveRepository {
  async findSave(userId: string, postId: string) {
    const result = await db
      .select({
        postId: postSaves.postId,
        userId: postSaves.userId,
        createdAt: postSaves.createdAt,
      })
      .from(postSaves)
      .where(and(eq(postSaves.userId, userId), eq(postSaves.postId, postId)))
      .limit(1);

    return result[0] ?? null;
  }

  async isPostSaved(userId: string, postId: string) {
    const result = await db
      .select({
        exists: sql<boolean>`true`,
      })
      .from(postSaves)
      .where(and(eq(postSaves.userId, userId), eq(postSaves.postId, postId)))
      .limit(1);

    return result.length > 0;
  }

  async createSave(userId: string, postId: string) {
    const result = await db
      .insert(postSaves)
      .values({
        userId,
        postId,
      })
      .onConflictDoNothing({
        target: [postSaves.postId, postSaves.userId],
      })
      .returning({
        postId: postSaves.postId,
        userId: postSaves.userId,
        createdAt: postSaves.createdAt,
      });

    return result[0] ?? null;
  }

  async deleteSave(userId: string, postId: string) {
    const result = await db
      .delete(postSaves)
      .where(and(eq(postSaves.userId, userId), eq(postSaves.postId, postId)))
      .returning({
        postId: postSaves.postId,
        userId: postSaves.userId,
        createdAt: postSaves.createdAt,
      });

    return result[0] ?? null;
  }

  async getSavedPosts(userId: string, limit: number, cursor?: Date) {
    const conditions: SQL<unknown>[] = [eq(postSaves.userId, userId)];

    if (cursor) {
      conditions.push(lt(postSaves.createdAt, cursor));
    }

    return db
      .select({
        // Post fields
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        subtitle: posts.subtitle,
        content: posts.content,
        excerpt: posts.excerpt,
        media: posts.media,
        codeSnippets: posts.codeSnippets,
        coverImageUrl: posts.coverImageUrl,
        coverImageAltText: posts.coverImageAltText,
        tags: posts.tags,
        authorId: posts.authorId,
        status: posts.status,
        publishDate: posts.publishDate,
        viewCount: posts.viewCount,
        likeCount: posts.likeCount,
        commentCount: posts.commentCount,
        shareCount: posts.shareCount,
        readTime: posts.readTime,
        createdAt: posts.createdAt,

        // Author fields
        authorUsername: users.username,
        authorProfileImage: users.profileImageUrl,
        authorFullname: users.fullname,

        // Save metadata
        savedAt: postSaves.createdAt,

        // Viewer flags
        isLikedByMe: sql<boolean>`
          exists(
            select 1 from ${postReactions}
            where ${postReactions.postId} = ${posts.id}
              and ${postReactions.userId} = ${userId}
              and ${postReactions.reactionType} = 'like'
          )
        `.mapWith(Boolean),

        isFollowingByMe: sql<boolean>`
          exists(
            select 1 from ${follows}
            where ${follows.followerId} = ${userId}
              and ${follows.followingId} = ${posts.authorId}
          )
        `.mapWith(Boolean),
      })
      .from(postSaves)
      .innerJoin(posts, eq(posts.id, postSaves.postId))
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(and(...conditions))
      .orderBy(desc(postSaves.createdAt))
      .limit(limit);
  }
}

export const saveRepository = new SaveRepository();