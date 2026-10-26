import { AppError } from "@shared/utils/app.error";
import { HTTP_STATUS } from "@shared/constants/http-codes";
import { commentRepository } from "../repositories/comment.repository";
import { notificationService } from "../../notification/notification.service";
import profanity from "leo-profanity";
import Sentiment from "sentiment";

const sentimentAnalyzer = new Sentiment();

// Helper function
function analyzeComment(text: string) {
  const lowerText = text.toLowerCase();

  // 1. Normalize leetspeak 
  const normalizedText = lowerText
    .replace(/[@]/g, "a")
    .replace(/[!|1]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$|5]/g, "s")
    .replace(/[^a-z0-9\s]/g, "");

  // 2. STRICT REGEX 
  const profanityPatterns = [
    /f[\W_]*[uU]?[\W_]*[cC]?[\W_]*[kK]/i, 
    /s[\W_]*[hH][\W_]*[iI][\W_]*[tT]/i,    
    /b[\W_]*[iI][\W_]*[tT][\W_]*[cC][\W_]*[hH]/i, 
    /a[\W_]*[sS][\W_]*[sS]/i,              
    /d[\W_]*[iI][\W_]*[cC][\W_]*[kK]/i,    
  ];

  const hasRegexProfanity = profanityPatterns.some((pattern) =>
    pattern.test(lowerText)
  );

  // 3. Check Profanity
  const isProfane = profanity.check(normalizedText) || hasRegexProfanity;

  // 4. Check Spam (2+ links)
  const linkCount = (text.match(/https?:\/\//gi) || []).length;
  const isSpam = linkCount >= 2;

  // 5. Status Check
  const status: "visible" | "shadowbanned" =
    isProfane || isSpam ? "shadowbanned" : "visible";

  // 6. Sentiment Check
  let sentiment: "neutral" | "positive" | "negative" = "neutral";
  if (!isProfane && !isSpam) {
    const result = sentimentAnalyzer.analyze(text);
    if (result.score > 0) sentiment = "positive";
    else if (result.score < 0) sentiment = "negative";
  }

  return { status, sentiment };
}

export class CommentService {
  
  async createComment(
    userId: string,
    postId: string,
    content: string,
    parentCommentId?: string | null,
  ) {
    const post = await commentRepository.findPostForComment(postId);

    if (!post) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, "Post not found");
    }

    if (parentCommentId) {
      const parentComment =
        await commentRepository.getCommentById(parentCommentId);

      if (!parentComment) {
        throw new AppError(HTTP_STATUS.NOT_FOUND, "Parent comment not found");
      }

      if (parentComment.postId !== postId) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          "Parent comment does not belong to this post",
        );
      }
    }

    const { status, sentiment } = analyzeComment(content);

    const comment = await commentRepository.createComment(
      postId,
      userId,
      content,
      parentCommentId,
      status, 
      sentiment
    );

    if (!comment) {
      throw new AppError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Failed to create comment",
      );
    }

    const createdComment = await commentRepository.getCommentById(
      comment.id,
      userId,
    );

    if (!createdComment) {
      throw new AppError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Failed to fetch created comment",
      );
    }

    try {
      if (parentCommentId) {
        // Someone replied to a comment
        const parentComment = await commentRepository.getCommentById(parentCommentId);
        if (parentComment && parentComment.authorId !== userId) {
          await notificationService.sendCommentNotification(
            parentComment.authorId,
            userId,
            postId,
            content.substring(0, 50) + (content.length > 50 ? "..." : ""),
            sentiment
          );
        }
      } else {
        // Someone commented on a post
        if (post.authorId !== userId) {
          await notificationService.sendCommentNotification(
            post.authorId,
            userId,
            postId,
            content.substring(0, 50) + (content.length > 50 ? "..." : ""),
            sentiment
          );
        }
      }
    } catch (error) {
      // Don't fail the comment if notification fails
      console.error("Failed to send comment notification", error);
    }

    return createdComment;
  }

  async getTopLevelComments(
    postId: string,
    limit: number = 20,
    cursor?: string,
    requesterId?: string,
  ) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        "Limit must be a positive integer",
      );
    }

    const parsedCursor = this.parseCursor(cursor);

    const comments = await commentRepository.getTopLevelComments(
      postId,
      limit,
      parsedCursor,
      requesterId,
    );

    const nextCursor =
      comments.length === limit
        ? (comments[comments.length - 1]?.createdAt?.toISOString() ?? null)
        : null;

    return {
      comments: comments.map((comment) => ({
        ...comment,
        isReacted: Boolean(comment.reactionType),
        reactionType: comment.reactionType ?? null,
      })),
      nextCursor,
    };
  }

  async getCommentReplies(
    parentCommentId: string,
    limit: number = 20,
    cursor?: string,
    requesterId?: string,
  ) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        "Limit must be a positive integer",
      );
    }

    const parentComment =
      await commentRepository.getCommentById(parentCommentId);

    if (!parentComment) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, "Comment not found");
    }

    const parsedCursor = this.parseCursor(cursor);

    const replies = await commentRepository.getCommentReplies(
      parentCommentId,
      limit,
      parsedCursor,
      requesterId,
    );

    const nextCursor =
      replies.length === limit
        ? (replies[replies.length - 1]?.createdAt?.toISOString() ?? null)
        : null;

    return {
      replies: replies.map((reply) => ({
        ...reply,
        isReacted: Boolean(reply.reactionType),
        reactionType: reply.reactionType ?? null,
      })),
      nextCursor,
    };
  }

  async getCommentById(commentId: string, requesterId?: string) {
    const comment = await commentRepository.getCommentById(
      commentId,
      requesterId,
    );

    if (!comment) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, "Comment not found");
    }

    return {
      ...comment,
      isReacted: Boolean(comment.reactionType),
      reactionType: comment.reactionType ?? null,
    };
  }

  async updateComment(userId: string, commentId: string, content: string) {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        "Comment content cannot be empty",
      );
    }

    const comment = await commentRepository.getCommentById(commentId);

    if (!comment) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, "Comment not found");
    }

    if (comment.authorId !== userId) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        "You are not authorized to edit this comment",
      );
    }

    const { status, sentiment } = analyzeComment(normalizedContent);

    const updated = await commentRepository.updateComment(
      commentId,
      normalizedContent,
      status,     
      sentiment, 
    );

    if (!updated) {
      throw new AppError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Failed to update comment",
      );
    }

    return this.getCommentById(commentId, userId);
  }

  async deleteComment(
    userId: string,
    commentId: string,
    isAdmin: boolean = false,
  ): Promise<void> {
    const comment = await commentRepository.getCommentById(commentId);

    if (!comment) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, "Comment not found");
    }

    // Check if the requester is the Post Owner
    const post = await commentRepository.findPostForComment(comment.postId);
    const isPostOwner = post?.authorId === userId;

    // Allow if: Comment Owner OR Post Owner OR Admin
    if (comment.authorId !== userId && !isPostOwner && !isAdmin) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        "Not authorized to delete this comment",
      );
    }

    const deleted = await commentRepository.deleteComment(commentId);

    if (!deleted) {
      throw new AppError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Failed to delete comment",
      );
    }
  }

  private parseCursor(cursor?: string): Date | undefined {
    if (!cursor) {
      return undefined;
    }

    const parsedCursor = new Date(cursor);

    if (Number.isNaN(parsedCursor.getTime())) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, "Invalid cursor");
    }

    return parsedCursor;
  }
}

export const commentService = new CommentService();
