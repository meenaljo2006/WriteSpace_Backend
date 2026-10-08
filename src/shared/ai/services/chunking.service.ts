import { EMBEDDING_CONSTANTS as C } from "../constants/embedding.constants";
import logger from "../../../config/logger";

export interface Chunk {
  index: number;
  text: string;
  tokenEstimate: number;
}

/**
 * Splits post content into overlapping semantic chunks suitable for embedding.
 *
 * Strategy:
 *   1. Strip HTML tags but preserve paragraph + heading structure.
 *   2. Split on double newlines (paragraph boundaries).
 *   3. Greedily merge small paragraphs up to TARGET_CHUNK_TOKENS.
 *   4. Split oversized paragraphs at sentence boundaries.
 *   5. Add CHUNK_OVERLAP_TOKENS worth of context from the previous chunk.
 */
export class ChunkingService {
  chunk(rawContent: string): Chunk[] {
    const clean = this.stripHtml(rawContent);
    const paragraphs = clean
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const merged: string[] = [];
    let buffer = "";

    for (const para of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${para}` : para;

      if (this.estimateTokens(candidate) > C.MAX_CHUNK_TOKENS) {
        // flush current buffer
        if (buffer) merged.push(buffer);

        // if the single paragraph itself is too big, split it by sentences
        if (this.estimateTokens(para) > C.MAX_CHUNK_TOKENS) {
          const subChunks = this.splitBySentences(para);
          merged.push(...subChunks);
          buffer = "";
        } else {
          buffer = para;
        }
      } else if (this.estimateTokens(candidate) >= C.TARGET_CHUNK_TOKENS) {
        merged.push(candidate);
        buffer = "";
      } else {
        buffer = candidate;
      }
    }

    if (buffer) merged.push(buffer);

    // Merge tiny trailing chunks into previous
    const finalPass: string[] = [];
    for (const chunk of merged) {
      if (
        this.estimateTokens(chunk) < C.MIN_CHUNK_TOKENS &&
        finalPass.length > 0
      ) {
        finalPass[finalPass.length - 1] += `\n\n${chunk}`;
      } else {
        finalPass.push(chunk);
      }
    }

    const chunks = this.applyOverlap(finalPass).map((text, index) => ({
      index,
      text,
      tokenEstimate: this.estimateTokens(text),
    }));

    logger.debug("Chunking complete", {
      chunkCount: chunks.length,
      totalTokens: chunks.reduce((a, c) => a + c.tokenEstimate, 0), 
    });

    return chunks;
  }

  // ---------------- helpers ----------------

  private stripHtml(html: string): string {
    return html
      // block-level → newline
      .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|code)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // strip remaining tags
      .replace(/<[^>]+>/g, "")
      // decode a few common entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // collapse excessive whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / C.CHARS_PER_TOKEN);
  }

  private splitBySentences(text: string): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    const out: string[] = [];
    let buf = "";

    for (const s of sentences) {
      const candidate = buf + s;
      if (this.estimateTokens(candidate) > C.MAX_CHUNK_TOKENS) {
        if (buf) out.push(buf.trim());
        buf = s;
      } else {
        buf = candidate;
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  private applyOverlap(chunks: string[]): string[] {
    if (chunks.length <= 1) return chunks;

    const overlapChars = C.CHUNK_OVERLAP_TOKENS * C.CHARS_PER_TOKEN;

    return chunks.map((chunk, i) => {
      if (i === 0) return chunk;
      const prev = chunks[i - 1];
      const tail = prev.slice(-overlapChars);
      return `${tail}\n\n${chunk}`;
    });
  }
}

export const chunkingService = new ChunkingService();