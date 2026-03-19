import { z, ZodError } from "zod";
import { Request, Response, NextFunction} from "express";
import { AuthenticatedRequest } from "../types/authRequest";
import { env } from "../config/env";

  
  const pageQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
  });
  
  const tmdbIdParamsSchema = z.object({
    tmdb_id: z.coerce.number().int().min(1),
  });
  
  const reviewBodySchema = z.object({
    tmdb_id: z.coerce.number().int().min(1),
    rating: z.number().int().min(1).max(10),
    content: z.string().trim().min(10).max(1000),
  });

  const aiSearchBodySchema = z.object({
    prompt: z.string().trim().min(1).max(500),
    page: z.coerce.number().int().min(1).default(1),
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
  
  async function forwardToCore(
    path: string,
    init?: RequestInit,
  ) {
    const response = await fetch(`${env.CORE_SERVICE_URL}${path}`, {

      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
  
    const payload = isJson ? await response.json() : await response.text();
  
    return {
      status: response.status,
      payload,
    };
  }
  
  function mapCoreError(status: number, payload: unknown) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? (payload as { detail?: unknown }).detail
        : null;
  
    if (status === 400) {
      return {
        status: 400,
        body: {
          error: {
            code: "BAD_REQUEST",
            message:
              typeof detail === "string" ? detail : "Request rejected by movie service",
            details: null,
          },
        },
      };
    }
  
    if (status === 401) {
      return {
        status: 401,
        body: {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication is required",
            details: null,
          },
        },
      };
    }
  
    if (status === 404) {
      return {
        status: 404,
        body: {
          error: {
            code: "MOVIE_NOT_FOUND",
            message: "Movie not found",
            details: null,
          },
        },
      };
    }
  
    if (status === 502) {
      return {
        status: 502,
        body: {
          error: {
            code: "CORE_TMDB_UNAVAILABLE",
            message: "Movie service is temporarily unavailable",
            details: null,
          },
        },
      };
    }
  
    return {
      status: 502,
      body: {
        error: {
          code: "CORE_REQUEST_FAILED",
          message: "Gateway failed to retrieve data from Core",
          details: null,
        },
      },
    };
  }
  
  function handleCoreResponse(res: Response, status: number, payload: unknown) {
    if (status >= 200 && status < 300) {
      return res.status(status).json(payload);
    }
  
    const mapped = mapCoreError(status, payload);
    return res.status(mapped.status).json(mapped.body);
  }

  export async function getDashboard(req: Request,res: Response,next: NextFunction) {
    try {
      const { status, payload } = await forwardToCore("/api/movies/dashboard/");
      return handleCoreResponse(res, status, payload);
    } catch (error) {
      next(error);
    }
  }
  
  export async function getPopularMovies(req: Request,res: Response,next: NextFunction) {
    try {
      const { page } = pageQuerySchema.parse(req.query);
      const { status, payload } = await forwardToCore(
        `/api/movies/popular/?page=${page}`,
      );
      return handleCoreResponse(res, status, payload);;
    } catch (error) {
      if (error instanceof ZodError) {
        return sendValidationError(res, error);
      }
      next(error);
    }
  }
  
  export async function getNowPlayingMovies(req: Request,res: Response,next: NextFunction) {
    try {
      const { page } = pageQuerySchema.parse(req.query);
      const { status, payload } = await forwardToCore(
        `/api/movies/now-playing/?page=${page}`,
      );
      return handleCoreResponse(res, status, payload);
    } catch (error) {
       if (error instanceof ZodError) {
        return sendValidationError(res, error);
      }
      next(error);
    }
  }
  
  export async function getUpcomingMovies(req: Request,res: Response,next: NextFunction) {
    try {
      const { page } = pageQuerySchema.parse(req.query);
      const { status, payload } = await forwardToCore(
        `/api/movies/upcoming/?page=${page}`,
      );
      return handleCoreResponse(res, status, payload);
    } catch (error) {
      if (error instanceof ZodError) {
        return sendValidationError(res, error);
      }
      next(error);
    }
  }
  
  export async function getTopRatedMovies(req: Request,res: Response,next: NextFunction) {
    try {
      const { page } = pageQuerySchema.parse(req.query);
      const { status, payload } = await forwardToCore(
        `/api/movies/top-rated/?page=${page}`,
      );
      return handleCoreResponse(res, status, payload);
    } catch (error) {
      if (error instanceof ZodError) {
        return sendValidationError(res, error);
      }
      next(error);
    }
  }
  
  export async function getMovieDetails(req: Request,res: Response,next: NextFunction) {
    try {
      const { tmdb_id } = tmdbIdParamsSchema.parse(req.params);
      const { status, payload } = await forwardToCore(`/api/movies/${tmdb_id}/`);
      return handleCoreResponse(res, status, payload);
    } catch (error) {
      if (error instanceof ZodError) {
        return sendValidationError(res, error);
      }
      next(error);
    }
  }
  
  export async function createReview(req: Request,res: Response,next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
  
      if (!authReq.user?.userId) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication is required",
            details: null,
          },
        });
      }
  
      const body = reviewBodySchema.parse(req.body);
  
      const { status, payload } = await forwardToCore("/api/movies/review/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": authReq.user.userId,
        },
        body: JSON.stringify(body),
      });
  
      return handleCoreResponse(res, status, payload);
    } catch (error) {
      if (error instanceof ZodError) {
        return sendValidationError(res, error);
      }
      next(error);
    }
  }

  export async function aiSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const body = aiSearchBodySchema.parse(req.body);

    const { status, payload } = await forwardToCore("/api/movies/ai/search/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}
