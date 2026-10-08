export const EMBEDDING_CONSTANTS = {
  // ---------- Chunking ----------
  TARGET_CHUNK_TOKENS: 600,   // aim for this size per chunk
  MAX_CHUNK_TOKENS: 800,      // hard cap — split if exceeded
  MIN_CHUNK_TOKENS: 120,      // merge if a chunk is smaller
  CHUNK_OVERLAP_TOKENS: 80,   // context overlap between adjacent chunks

  // Rough token estimation for English text (4 chars ≈ 1 token)
  CHARS_PER_TOKEN: 4,

  // ---------- Batching / retries ----------
  MAX_BATCH_SIZE: 16,
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: 1000,

  // ---------- BullMQ ----------
  QUEUE_NAME: "embedding",
  JOB_NAME_EMBED_POST: "embed-post",
  JOB_ATTEMPTS: 5,
  JOB_BACKOFF_DELAY_MS: 5000,
} as const;