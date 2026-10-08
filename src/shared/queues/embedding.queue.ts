import { Queue } from "bullmq";
import { bullmqRedisConnection as connection } from "../../config/bullmq";
import { EMBEDDING_CONSTANTS as C } from "../ai/constants/embedding.constants";
import logger from "../../config/logger";

export interface EmbedPostJob {
  postId: string;
  reason: "created" | "updated" | "manual";
}

export const embeddingQueue = new Queue<EmbedPostJob>(C.QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: C.JOB_ATTEMPTS,
    backoff: { type: "exponential", delay: C.JOB_BACKOFF_DELAY_MS },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export async function enqueueEmbedPost(
  postId: string,
  reason: EmbedPostJob["reason"] = "manual"
): Promise<void> {
  try {
    await embeddingQueue.add(C.JOB_NAME_EMBED_POST, { postId, reason });
    logger.debug(`Embedding job enqueued for post ${postId} (reason: ${reason})`);
  } catch (error: any) {
    logger.error(
      `Failed to enqueue embedding job for post ${postId}: ${error.message}`
    );
  }
}