import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { vector } from "../custom-types/vector";
import { posts } from "./posts";

export const postEmbeddings = pgTable(
  "post_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("post_embeddings_post_id_idx").on(table.postId),
    index("post_embeddings_embedding_hnsw_idx")
      .using("hnsw", sql`${table.embedding} vector_cosine_ops`),
  ]
);

export type PostEmbedding = typeof postEmbeddings.$inferSelect;
export type NewPostEmbedding = typeof postEmbeddings.$inferInsert;