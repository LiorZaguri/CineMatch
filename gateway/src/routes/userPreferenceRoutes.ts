import { Router } from "express";
import { authenticateJwt } from "../middleware/authMiddleware";
import {
  getMyPreferences,
  updateUserPreferences,
  addChosenMovie,
  removeChosenMovie,
  checkMoviePreference,
} from "../controllers/userPreferenceController";

export const userPreferenceRoutes = Router();

userPreferenceRoutes.get("/me/", authenticateJwt, getMyPreferences);
userPreferenceRoutes.put("/update/", authenticateJwt, updateUserPreferences);
userPreferenceRoutes.post("/movie/", authenticateJwt, addChosenMovie);
userPreferenceRoutes.delete("/movie/:tmdb_id/", authenticateJwt, removeChosenMovie);
userPreferenceRoutes.get("/movie/:tmdb_id/", authenticateJwt, checkMoviePreference);
