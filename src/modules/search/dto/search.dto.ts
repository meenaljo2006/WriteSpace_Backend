import { z } from "zod";

export const searchPostsQuerySchema = z.object({
  q: z.string().trim().min(1, "Query is required").max(300),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  tags: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : undefined)),
  authorId: z.string().uuid().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export type SearchPostsQuery = z.infer<typeof searchPostsQuerySchema>;