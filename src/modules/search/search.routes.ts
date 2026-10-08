import { Router } from "express";
import { searchController } from "./controllers/search.controller";

const router = Router();

/**
 * GET /api/v1/search/posts?q=...
 * Public endpoint — no auth required.
 */
router.get("/posts", searchController.searchPosts.bind(searchController));

export default router;