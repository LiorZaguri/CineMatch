/* auth routing before access */
import { Router } from "express";
import {
  changePassword,
  confirmAvatarUpload,
  deleteAccount,
  getAvatarUploadUrl,
  login,
  register,
  updateOnboardingStatus,
  updateProfile,
} from "../controllers/authController";
import { authenticateJwt } from "../middleware/authMiddleware";

export const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.patch("/me", authenticateJwt, updateProfile);
authRoutes.patch("/me/onboarding-status", authenticateJwt, updateOnboardingStatus);
authRoutes.delete("/me", authenticateJwt, deleteAccount);
authRoutes.get("/me/avatar/upload-url",authenticateJwt, getAvatarUploadUrl);
authRoutes.post("/me/avatar/confirm",authenticateJwt, confirmAvatarUpload);
authRoutes.post("/change-password", authenticateJwt, changePassword);
