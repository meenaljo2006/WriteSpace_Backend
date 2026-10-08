import { env } from "../../../config/env";
import logger from "../../../config/logger";

interface OllamaEmbedResponse {
  embeddings: number[][];
}

class OllamaClient {
  private readonly baseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, "");

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(
    texts: string[],
    model: string = env.EMBEDDING_MODEL
  ): Promise<number[][]> {
    try {
      const data = await this.request<OllamaEmbedResponse>("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!data.embeddings || data.embeddings.length !== texts.length) {
        throw new Error(
          `Ollama returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`
        );
      }

      return data.embeddings;
    } catch (error: any) {
      logger.error(
        `Ollama embed failed (model=${model}, batchSize=${texts.length}): ${error.message}`
      );
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<void>("/api/tags");
      return true;
    } catch {
      return false;
    }
  }
}

export const ollamaClient = new OllamaClient();