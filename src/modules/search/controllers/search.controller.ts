import type { Request, Response, NextFunction } from "express";
import { searchService } from "../services/search.service";
import { searchPostsQuerySchema } from "../dto/search.dto";

export class SearchController {
  async searchPosts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = searchPostsQuerySchema.parse(req.query);

      const results = await searchService.searchPosts({
        query: query.q,
        limit: query.limit,
        offset: query.offset,
        tags: query.tags,
        authorId: query.authorId,
        fromDate: query.fromDate,
        toDate: query.toDate,
      });

      res.json({
        success: true,
        data: {
          query: query.q,
          count: results.length,
          results,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const searchController = new SearchController();