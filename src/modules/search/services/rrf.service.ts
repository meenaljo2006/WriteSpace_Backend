import type { FusedResult } from "../interfaces/search.interface";

const RRF_K = 60; // standard constant from the original RRF paper

export class RrfService {
  /**
   * Fuse multiple ranked lists into one.
   * Each input is an ordered array of postIds (best first).
   * Returns combined scores sorted by score DESC.
   */
  fuse(rankedLists: Array<{ postId: string; matchedChunk?: string }[]>): FusedResult[] {
    const scores = new Map<string, number>();
    const chunks = new Map<string, string | undefined>();

    for (const list of rankedLists) {
      list.forEach((item, index) => {
        const rank = index + 1;
        const contribution = 1 / (RRF_K + rank);
        scores.set(item.postId, (scores.get(item.postId) ?? 0) + contribution);

        // Prefer the vector-search chunk if available
        if (!chunks.has(item.postId) && item.matchedChunk) {
          chunks.set(item.postId, item.matchedChunk);
        }
      });
    }

    return Array.from(scores.entries())
      .map(([postId, score]) => ({
        postId,
        score,
        matchedChunk: chunks.get(postId),
      }))
      .sort((a, b) => b.score - a.score);
  }
}

export const rrfService = new RrfService();