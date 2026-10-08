import { Worker, Job } from "bullmq";
import { bullmqRedisConnection as connection } from "../../config/bullmq";
import { EMBEDDING_CONSTANTS as C } from "../ai/constants/embedding.constants";
import { embeddingPipelineService } from "../ai/services/embedding-pipeline.service";
import type { EmbedPostJob } from "./embedding.queue";
import logger from "../../config/logger";

export const embeddingWorker = new Worker<EmbedPostJob>(
  C.QUEUE_NAME,
  async (job: Job<EmbedPostJob>) => {
    const { postId, reason } = job.data;
    logger.info(
      `Processing embedding job: postId=${postId}, reason=${reason}, jobId=${job.id}`
    );

    const result = await embeddingPipelineService.processPost(postId);
    return result;
  },
  {
    connection,
    concurrency: 6,
  }
);

embeddingWorker.on("completed", (job) => {
  logger.debug(`Embedding job completed: jobId=${job.id}`);
});

embeddingWorker.on("failed", (job, err) => {
  logger.error(
    `Embedding job failed: jobId=${job?.id}, postId=${job?.data.postId}, err=${err.message}`
  );
});