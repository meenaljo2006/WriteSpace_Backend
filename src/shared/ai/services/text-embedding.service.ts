import { ollamaClient } from "../clients/ollama.client";
import { EMBEDDING_CONSTANTS as C } from "../constants/embedding.constants";
import { env } from "../../../config/env";
import logger from "../../../config/logger";

export class TextEmbeddingService {
  /**
   * Embed an array of texts. Automatically batches large inputs
   * and retries on transient failure.
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const batches = this.chunkArray(texts, C.MAX_BATCH_SIZE);
    const results: number[][] = [];

    for (const batch of batches) {
      const embeddings = await this.embedWithRetry(batch);
      results.push(...embeddings);
    }

    return results;
  }

  async embedText(text: string): Promise<number[]> {
    const [vec] = await this.embedTexts([text]);
    return vec;
  }

  // ---------------- internals ----------------

  private async embedWithRetry(batch: string[]): Promise<number[][]> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= C.MAX_RETRIES; attempt++) {
      try {
        const embeddings = await ollamaClient.embed(batch, env.EMBEDDING_MODEL);

        // sanity check — dimension match
        for (const vec of embeddings) {
          if (vec.length !== env.EMBEDDING_DIMENSIONS) {
            throw new Error(
              `Expected ${env.EMBEDDING_DIMENSIONS}-dim embedding, got ${vec.length}`
            );
          }
        }

        return embeddings;
      } catch (error: any) {
        lastError = error;
        logger.warn(
          `Embedding attempt failed (attempt ${attempt}, batch size ${batch.length}): ${error.message}`
        );

        if (attempt < C.MAX_RETRIES) {
          const delay = C.RETRY_BACKOFF_MS * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw new Error(
      `Embedding failed after ${C.MAX_RETRIES} attempts: ${String(lastError)}`
    );
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }
}

export const textEmbeddingService = new TextEmbeddingService();