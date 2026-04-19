import { Request, Response, NextFunction} from "express";
import { AuthenticatedRequest } from "../types/authRequest";
import {
  AuthError,
  changeUserPassword,
  deleteUserAccount,
  loginUser,
  registerUser,
  updateUserOnboardingStatus,
  updateUserProfile,
  updateUserAvatar,
} from "../services/authService";
import { initializeCorePreferences } from "./userPreferenceController";
import {buildPublicFileUrl,createAvatarUploadUrl,validateAvatarContentType,} from "../services/S3Service";





function isValidEmail(email: string) {
  return typeof email === "string" && email.includes("@") && email.length <= 255;
}

function isValidPassword(password: string) {
  return typeof password === "string" && password.length >= 8 && password.length <= 72;
}

function isValidDisplayName(displayName: string) {
  return typeof displayName === "string" && displayName.trim().length >= 2 && displayName.trim().length <= 80;
}

function isValidOnboardingStatus(status: string) {
  return status === "pending" || status === "completed" || status === "skipped";
}

function getAuthenticatedUserId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    return null;
  }

  return req.user.userId;
}

export async function register(req: Request, res: Response) {
  const { email, password, displayName } = req.body ?? {};

  if (!isValidEmail(email) || !isValidPassword(password) || !isValidDisplayName(displayName)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid email, password, or displayName" });
  }

  try {
    const result = await registerUser(email, password, displayName.trim());

    // Initialize default preferences in Core service
    try {
      await initializeCorePreferences(result.user.id);
    } catch (prefErr: any) {
      console.error("Failed to initialize core preferences for new user:", prefErr);
      return res.status(500).json({
        error: "CORE_INITIALIZATION_FAILED",
        message: "User created, but failed to initialize preferences in core service.",
        details: prefErr.message
      });
    }

    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "EMAIL_ALREADY_EXISTS") {
      return res.status(400).json({ error: "EMAIL_ALREADY_EXISTS", message: "Email already exists" });
    }
    console.error("AUTH 500 ERROR:", err);

    return res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Internal server error"});
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid email or password" });
  }

  try {
    const result = await loginUser(email, password);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "INVALID_CREDENTIALS") {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid credentials" });
    }
    console.error("AUTH 500 ERROR:", err);

    return res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Internal server error"});
  }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { displayName } = req.body ?? {};

  if (!isValidDisplayName(displayName)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid displayName" });
  }

  try {
    const user = await updateUserProfile(userId, displayName.trim());
    return res.status(200).json({ user });
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    console.error("AUTH 500 ERROR:", err);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }
}

export async function updateOnboardingStatus(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { onboardingStatus } = req.body ?? {};

  if (typeof onboardingStatus !== "string" || !isValidOnboardingStatus(onboardingStatus)) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "Invalid onboardingStatus",
    });
  }

  try {
    const user = await updateUserOnboardingStatus(userId, onboardingStatus);
    return res.status(200).json({ user });
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    console.error("AUTH 500 ERROR:", err);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { oldPassword, newPassword } = req.body ?? {};

  if (!isValidPassword(oldPassword) || !isValidPassword(newPassword)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid password" });
  }

  try {
    await changeUserPassword(userId, oldPassword, newPassword);
    return res.status(204).send();
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    if (err instanceof AuthError && err.code === "INVALID_PASSWORD") {
      return res.status(401).json({ error: "INVALID_PASSWORD", message: "Current password is incorrect" });
    }

    console.error("AUTH 500 ERROR:", err);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }
}

export async function deleteAccount(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { password } = req.body ?? {};

  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid password" });
  }

  try {
    await deleteUserAccount(userId, password);
    return res.status(204).send();
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    if (err instanceof AuthError && err.code === "INVALID_PASSWORD") {
      return res.status(401).json({ error: "INVALID_PASSWORD", message: "Password is incorrect" });
    }

    console.error("AUTH 500 ERROR:", err);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }
}

export async function getAvatarUploadUrl(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { contentType } = req.query;

  if (typeof contentType !== "string") {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "contentType is required",
    });
  }

  try {
    validateAvatarContentType(contentType);

    const result = await createAvatarUploadUrl(userId, contentType);

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: err.message ?? "Invalid avatar upload request",
    });
  }
}

export async function confirmAvatarUpload(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req, res);
  if (!userId) {
    return;
  }

  const { fileKey } = req.body ?? {};

  if (typeof fileKey !== "string" || fileKey.trim() === "") {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "fileKey is required",
    });
  }

  const normalizedFileKey = fileKey.trim();

  if (!normalizedFileKey.startsWith(`avatars/${userId}/`)) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Invalid avatar key",
    });
  }

  try {
    const avatarUrl = buildPublicFileUrl(normalizedFileKey);
    const user = await updateUserAvatar(userId, avatarUrl);

    return res.status(200).json({ user });
  } catch (err: any) {
    if (err instanceof AuthError && err.code === "USER_NOT_FOUND") {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    console.error("AUTH 500 ERROR:", err);

    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  }
}


