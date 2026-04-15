import { z, ZodError } from "zod";
import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/authRequest";
import { env } from "../config/env";

const DiscoveryMode = z.enum(["mainstream confident", "hidden gems", "best mix"]);
const Language = z.enum(["English", "Korean", "Japanese", "French", "Spanish", "Open to anything"]);
const Runtime = z.enum(["100", "100-140", "140+", "No preference"]);
const Era = z.enum(["1970", "1980", "1990", "2000", "2010", "2020"]);
const LanguageList = z.preprocess((value) => value == null ? [] : value, z.array(Language));
const EraList = z.preprocess((value) => value == null ? [] : value, z.array(Era));
const GenreName = z.enum([
  "Thriller", "Drama", "Sci-fi", "Crime", "Mystery", "Comedy",
  "Romance", "Horror", "Animation", "Fantasy", "Documentary", "Action"
]);

const userMovieCreateSchema = z.object({
  tmdb_id: z.number().int().min(1),
});

const likedGenreCreateSchema = z.object({
  name: GenreName,
});

const dislikedGenreCreateSchema = z.object({
  name: GenreName,
});

const userMoodCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const userPreferenceCreateSchema = z.object({
  discovery_mode: DiscoveryMode.default("best mix"),
  languages: LanguageList,
  runtime: Runtime.nullable().optional(),
  eras: EraList,
  chosen_movies: z.array(userMovieCreateSchema).default([]),
  liked_genres: z.array(likedGenreCreateSchema).default([]),
  disliked_genres: z.array(dislikedGenreCreateSchema).default([]),
  moods: z.array(userMoodCreateSchema).default([]),
});

const tmdbIdParamsSchema = z.object({
  tmdb_id: z.coerce.number().int().min(1),
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

/**
 * Internal helper to initialize preferences in Core.
 * Called during the registration flow.
 */
export async function initializeCorePreferences(userId: string) {
  const response = await forwardToCore("/api/user-preferences/register/", undefined, {
    method: "POST",
    headers: { "x-user-id": userId },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Core preference initialization failed with status ${response.status}: ${JSON.stringify(response.payload)}`);
  }

  return response;
}

async function forwardToCore(path: string, req?: Request, init?: RequestInit) {
  const url = `${env.CORE_SERVICE_URL}${path}`;
  
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> ?? {}),
  };

  if (req) {
    const country = req.headers["cf-ipcountry"];
    if (country) {
      headers["cf-ipcountry"] = country as string;
    }
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    const payload = isJson ? await response.json() : await response.text();

    return {
      status: response.status,
      payload,
    };
  } catch (error) {
    console.error(`Fetch error forwarding to Core (${url}):`, error);
    throw error;
  }
}

function handleCoreResponse(res: Response, status: number, payload: unknown) {
  if (status >= 200 && status < 300) {
    return res.status(status).json(payload);
  }

  const detail =
    typeof payload === "object" && payload !== null && "detail" in payload
      ? (payload as { detail?: unknown }).detail
      : null;

  return res.status(status).json({
    error: {
      code: "CORE_ERROR",
      message: typeof detail === "string" ? detail : "Error from user preference service",
      details: payload,
    },
  });
}

export async function getMyPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const { status, payload } = await forwardToCore("/api/user-preferences/me/", undefined, {
      headers: { "x-user-id": userId },
    });
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    next(error);
  }
}

export async function updateUserPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const body = userPreferenceCreateSchema.parse(req.body);

    const { status, payload } = await forwardToCore("/api/user-preferences/update/", undefined, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify(body),
    });
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(res, error);
    next(error);
  }
}

export async function addChosenMovie(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const body = userMovieCreateSchema.parse(req.body);

    const { status, payload } = await forwardToCore("/api/user-preferences/movie/", undefined, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify(body),
    });
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(res, error);
    next(error);
  }
}

export async function removeChosenMovie(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const { tmdb_id } = tmdbIdParamsSchema.parse(req.params);

    const { status, payload } = await forwardToCore(`/api/user-preferences/movie/${tmdb_id}/`, undefined, {
      method: "DELETE",
      headers: { "x-user-id": userId },
    });
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(res, error);
    next(error);
  }
}

export async function checkMoviePreference(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getAuthenticatedUserId(req as AuthenticatedRequest, res);
    if (!userId) return;

    const { tmdb_id } = tmdbIdParamsSchema.parse(req.params);

    const { status, payload } = await forwardToCore(`/api/user-preferences/movie/${tmdb_id}/`, undefined, {
      headers: { "x-user-id": userId },
    });
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(res, error);
    next(error);
  }
}
