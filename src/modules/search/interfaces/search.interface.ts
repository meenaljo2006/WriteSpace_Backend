export interface SearchOptions {
  query: string;
  limit: number;
  offset: number;
  tags?: string[];
  authorId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface VectorSearchRow {
  postId: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;   // 0..1 cosine similarity
}

export interface LexicalSearchRow {
  postId: string;
  rank: number;         // higher = better
}

export interface FusedResult {
  postId: string;
  score: number;        // combined RRF score
  matchedChunk?: string; // best-matching chunk from vector search
}

export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  excerpt: string | null;
  coverImageUrl: string | null;
  tags: string[] | null;
  readTime: number | null;
  publishDate: Date | null;
  author: {
    id: string;
    username: string;
    fullname: string;
    profileImageUrl: string | null;
  };
  score: number;
  matchedChunk: string | null;
}