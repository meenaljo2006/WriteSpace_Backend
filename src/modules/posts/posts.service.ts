import { eq } from "drizzle-orm";

import { db } from "../../db";
import { posts } from "../../db/schema";

import { AppError } from "@shared/utils/app.error";
import { HTTP_STATUS } from "@shared/constants/http-codes";
import { enqueueEmbedPost } from "@shared/queues/embedding.queue";
import env from "@config/env";

import { interactionsService } from "../interactions/interactions.service";

import { postQueryService } from "./services/post-query.service";
import {
  postCommandService,
  CreatePostData,
  UpdatePostData,
} from "./services/post-command.service";

class PostService {
  /**
   * Create a new post.
   */
  public async createPost(authorId: string, data: CreatePostData) {
    const postId = await postCommandService.createPost(authorId, data);

    // Queue embedding generation asynchronously (non-blocking)
    await enqueueEmbedPost(postId, "created");

    return this.getPost(postId, authorId);
  }

  /**
   * Get a single post.
   */
  public async getPost(postId: string, requesterId?: string) {
    return postQueryService.getPost(postId, requesterId);
  }

  /**
   * Get a paginated list of posts.
   */
  public async getPosts(
    limit: number,
    cursor?: string,
    requesterId?: string,
    authorIdFilter?: string,
  ) {
    return postQueryService.getPosts(
      limit,
      cursor,
      requesterId,
      authorIdFilter,
    );
  }

  /**
   * Update an existing post.
   */
  public async updatePost(
    postId: string,
    userId: string,
    data: UpdatePostData,
  ) {
    await postCommandService.updatePost(postId, userId, data);

    // Re-embed on update — title / content / tags may have changed
    await enqueueEmbedPost(postId, "updated");

    return this.getPost(postId, userId);
  }

  /**
   * Move a post to trash.
   *
   * Note: trashing is a soft delete (status → "trash").
   * The embedding pipeline detects the status change and
   * removes existing embeddings for the post.
   */
  public async deletePost(
    postId: string,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<void> {
    await postCommandService.trashPost(postId, userId, isAdmin);

    // Trigger pipeline to clean up embeddings (status != published)
    await enqueueEmbedPost(postId, "updated");
  }

  /**
   * Restore a trashed post.
   *
   * Re-embedding is triggered here because the post may
   * return to "published" status.
   */
  public async restorePost(postId: string, userId: string): Promise<void> {
    await postCommandService.restorePost(postId, userId);

    await enqueueEmbedPost(postId, "updated");
  }

  /**
   * Like or unlike a post.
   *
   * TODO:
   * Move post engagement operations into a dedicated
   * post-engagement.service.ts.
   */
  public async likePost(
    postId: string,
    userId: string,
  ): Promise<{
    status: "liked" | "unliked";
  }> {
    const existingReaction = await interactionsService.setPostReaction(
      userId,
      postId,
      "like",
    );

    return {
      status: existingReaction.isReacted ? "liked" : "unliked",
    };
  }

  /**
   * Generate a platform-specific share URL and
   * record the share interaction.
   *
   * TODO:
   * Move post engagement operations into a dedicated
   * post-engagement.service.ts.
   */
  public async sharePost(
    postId: string,
    userId: string,
    platform: string,
  ): Promise<{
    url: string;
    platform: string;
  }> {
    const [post] = await db
      .select({
        slug: posts.slug,
        title: posts.title,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, "Post not found");
    }

    const baseUrl = env.CLIENT_URL || "https://writespace.com";

    const postUrl = `${baseUrl}/blog/${post.slug}`;

    let shareUrl: string;

    switch (platform.toLowerCase()) {
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          post.title,
        )}&url=${encodeURIComponent(postUrl)}`;
        break;

      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          postUrl,
        )}`;
        break;

      case "linkedin":
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          postUrl,
        )}`;
        break;

      default:
        shareUrl = postUrl;
    }

    await interactionsService.createShare({
      actorId: userId,
      postId,
      platform,
    });

    return {
      url: shareUrl,
      platform,
    };
  }
}

export const postService = new PostService();