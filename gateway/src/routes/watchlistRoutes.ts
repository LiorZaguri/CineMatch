import { Router } from "express";
import { authenticateJwt } from "../middleware/authMiddleware";
import {
  addMovieToWatchlist,
  getMyWatchlist,
  getWatchlistMovieStatus,
  removeMovieFromWatchlist,
} from "../controllers/watchlistController";

export const watchlistRoutes = Router();

watchlistRoutes.get("/", authenticateJwt, getMyWatchlist);
watchlistRoutes.post("/", authenticateJwt, addMovieToWatchlist);
watchlistRoutes.delete("/:tmdb_id/", authenticateJwt, removeMovieFromWatchlist);
watchlistRoutes.get("/:tmdb_id/", authenticateJwt, getWatchlistMovieStatus);
