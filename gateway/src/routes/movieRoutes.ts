/* web pages with check auth with jwt and access for core by proxy */
import { Router } from "express";
import { authenticateJwt } from "../middleware/authMiddleware";
import {createReview,getDashboard,getMovieDetails,getMovieSummary,getNowPlayingMovies,getPopularMovies,getTopRatedMovies,getUpcomingMovies,aiSearch,searchMovies,updateReview} from "../controllers/movieController";

export const movieRoutes = Router();

movieRoutes.get("/dashboard/", getDashboard);
movieRoutes.get("/popular/", getPopularMovies);
movieRoutes.get("/now-playing/", getNowPlayingMovies);
movieRoutes.get("/upcoming/", getUpcomingMovies);
movieRoutes.get("/top-rated/", getTopRatedMovies);
movieRoutes.get("/search/", searchMovies);
movieRoutes.post("/review/", authenticateJwt, createReview);
movieRoutes.patch("/review/:review_id/", authenticateJwt, updateReview);
movieRoutes.get("/ai/:tmdb_id/summary/", getMovieSummary);
movieRoutes.get("/:tmdb_id/", getMovieDetails);
movieRoutes.post("/ai/search", authenticateJwt, aiSearch);
