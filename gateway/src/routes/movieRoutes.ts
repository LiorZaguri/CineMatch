/* web pages with check auth with jwt and access for core by proxy */
import { Router } from "express";
import { authenticateJwt } from "../middleware/authMiddleware";
import {createReview,getDashboard,getMovieDetails,getNowPlayingMovies,getPopularMovies,getTopRatedMovies,getUpcomingMovies,} from "../controllers/movieController";

export const movieRoutes = Router();

movieRoutes.get("/dashboard/", getDashboard);
movieRoutes.get("/popular/", getPopularMovies);
movieRoutes.get("/now-playing/", getNowPlayingMovies);
movieRoutes.get("/upcoming/", getUpcomingMovies);
movieRoutes.get("/top-rated/", getTopRatedMovies);
movieRoutes.post("/review/", authenticateJwt, createReview);
movieRoutes.get("/:tmdb_id/", getMovieDetails);
