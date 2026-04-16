import { z, ZodError } from "zod";
import { NextFunction, Request, Response } from "express";
import { AuthenticatedRequest } from "../types/authRequest";
import {
  addWatchlistMovie,
  isMovieInWatchlist,
  listWatchlist,
  removeWatchlistMovie,
} from "../services/watchlistService";

const tmdbIdParamsSchema = z.object({
  tmdb_id: z.coerce.number().int().min(1),
});

const watchlistBodySchema = z.object({
  tmdb_id: z.number().int().min(1),
});

function sendValidationError(res: Response, error: ZodError) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid request parameters",
      details: error.flatten(),
    },
  });
}

function getAuthenticatedUserId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required",
        details: null,
      },
    });
    return null;
  }

  return req.user.userId;
}

export async function getMyWatchlist(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const entries = await listWatchlist(userId);
    return res.status(200).json({
      items: entries.map((entry) => ({
        id: entry.id,
        tmdb_id: entry.tmdbId,
        created_at: entry.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function addMovieToWatchlist(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const body = watchlistBodySchema.parse(req.body);
    const entry = await addWatchlistMovie(userId, body.tmdb_id);

    return res.status(201).json({
      id: entry.id,
      tmdb_id: entry.tmdbId,
      created_at: entry.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function removeMovieFromWatchlist(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const { tmdb_id } = tmdbIdParamsSchema.parse(req.params);
    const removed = await removeWatchlistMovie(userId, tmdb_id);

    if (!removed) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Movie not found in your list",
          details: null,
        },
      });
    }

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function getWatchlistMovieStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const { tmdb_id } = tmdbIdParamsSchema.parse(req.params);
    const is_in_list = await isMovieInWatchlist(userId, tmdb_id);
    return res.status(200).json({ is_in_list });
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}
