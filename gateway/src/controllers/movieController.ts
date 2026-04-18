import { z, ZodError } from 'zod';
import { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import https from 'node:https';
import { AuthenticatedRequest } from '../types/authRequest';
import { env } from '../config/env';
import { getUsersByIds } from '../services/authService';
import { isMovieInWatchlist } from '../services/watchlistService';

const reviewExternalLinkPattern =
  /\b(?:https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|tv|app|dev|info|biz|me|gg|xyz)(?:\/\S*)?)/gi;
const reviewBadWordsPattern =
  /\b(?:asshole|bastard|bitch|bullshit|cunt|dick|douchebag|fuck|fucker|fucking|motherfucker|piss(?:ed)?\s*off|shit|slut|whore)\b/i;

function sanitizeReviewContent(content: string): string {
  return content.replace(reviewExternalLinkPattern, ' ').replace(/\s+/g, ' ').trim();
}

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

const movieSearchQuerySchema = z.object({
  query: z.string().trim().min(1),
  page: z.coerce.number().int().min(1).default(1),
});

const tmdbIdParamsSchema = z.object({
  tmdb_id: z.coerce.number().int().min(1),
});

const reviewIdParamsSchema = z.object({
  review_id: z.coerce.number().int().min(1),
});

const reviewBodySchema = z.object({
  tmdb_id: z.coerce.number().int().min(1),
  rating: z.number().int().min(1).max(10),
  content: z
    .string()
    .trim()
    .transform(sanitizeReviewContent)
    .pipe(z.string().min(10).max(1000))
    .refine((value) => !reviewBadWordsPattern.test(value), {
      message: 'Review contains inappropriate language',
    }),
});

const reviewUpdateBodySchema = z.object({
  rating: z.number().int().min(1).max(10),
  content: z
    .string()
    .trim()
    .transform(sanitizeReviewContent)
    .pipe(z.string().min(10).max(1000))
    .refine((value) => !reviewBadWordsPattern.test(value), {
      message: 'Review contains inappropriate language',
    }),
});

const aiSearchBodySchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  page: z.coerce.number().int().min(1).default(1),
});

function sendValidationError(res: Response, error: ZodError) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request parameters',
      details: error.flatten(),
    },
  });
}

async function forwardToCore(path: string, req?: Request, init?: RequestInit) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  if (req) {
    const country = req.headers['cf-ipcountry'];
    if (country) {
      headers['cf-ipcountry'] = country as string;
    }
  }

  const body =
    typeof init?.body === 'string' || Buffer.isBuffer(init?.body) ? init.body : undefined;
  const coreRequest = {
    method: init?.method ?? 'GET',
    headers,
    ...(body !== undefined ? { body } : {}),
  };

  const response = await requestCore(`${env.CORE_SERVICE_URL}${path}`, coreRequest);

  const contentType = response.headers['content-type'] ?? '';
  const isJson = contentType.includes('application/json');

  const payload = isJson ? JSON.parse(response.body) : response.body;

  return {
    status: response.statusCode,
    payload,
  };
}

function requestCore(
  targetUrl: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | Buffer;
  },
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const body = init.body;
    const headers = { ...init.headers };

    if (body !== undefined) {
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const request = client.request(
      url,
      {
        method: init.method,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 502,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('error', reject);

    if (body !== undefined) {
      request.write(body);
    }

    request.end();
  });
}

function mapCoreError(status: number, payload: unknown) {
  const detail =
    typeof payload === 'object' && payload !== null && 'detail' in payload
      ? (payload as { detail?: unknown }).detail
      : null;

  if (status === 400) {
    return {
      status: 400,
      body: {
        error: {
          code: 'BAD_REQUEST',
          message: typeof detail === 'string' ? detail : 'Request rejected by movie service',
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
          code: 'UNAUTHORIZED',
          message: 'Authentication is required',
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
          code: 'MOVIE_NOT_FOUND',
          message: 'Movie not found',
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
          code: 'CORE_TMDB_UNAVAILABLE',
          message: 'Movie service is temporarily unavailable',
          details: null,
        },
      },
    };
  }

  return {
    status: 502,
    body: {
      error: {
        code: 'CORE_REQUEST_FAILED',
        message: 'Gateway failed to retrieve data from Core',
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

async function enrichMovieDetailsPayload(payload: unknown) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('reviews' in payload) ||
    !Array.isArray((payload as { reviews?: unknown[] }).reviews)
  ) {
    return payload;
  }

  const moviePayload = payload as {
    reviews: Array<{
      author_details?: {
        user_id?: string;
        source?: string;
        name?: string | null;
        avatar_url?: string | null;
      };
    }>;
  };

  const userIds = moviePayload.reviews
    .map((review) =>
      review.author_details?.source === 'local' ? review.author_details?.user_id : undefined,
    )
    .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0);

  if (userIds.length === 0) {
    return payload;
  }

  let users: Awaited<ReturnType<typeof getUsersByIds>>;
  try {
    users = await getUsersByIds(userIds);
  } catch {
    return payload;
  }
  const usersById = new Map(users.map((user) => [user.id, user]));

  return {
    ...moviePayload,
    reviews: moviePayload.reviews.map((review) => {
      const userId = review.author_details?.user_id;
      const user = userId ? usersById.get(userId) : undefined;

      if (!user || review.author_details?.source !== 'local') {
        return review;
      }

      return {
        ...review,
        author_details: {
          ...review.author_details,
          name: user.displayName,
          avatar_url: user.avatarUrl,
        },
      };
    }),
  };
}

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, payload } = await forwardToCore('/api/movies/dashboard/');
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    next(error);
  }
}

export async function getPopularMovies(req: Request, res: Response, next: NextFunction) {
  try {
    const { page } = pageQuerySchema.parse(req.query);
    const { status, payload } = await forwardToCore(`/api/movies/popular/?page=${page}`);
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function getNowPlayingMovies(req: Request, res: Response, next: NextFunction) {
  try {
    const { page } = pageQuerySchema.parse(req.query);
    const { status, payload } = await forwardToCore(`/api/movies/now-playing/?page=${page}`);
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function getUpcomingMovies(req: Request, res: Response, next: NextFunction) {
  try {
    const { page } = pageQuerySchema.parse(req.query);
    const { status, payload } = await forwardToCore(`/api/movies/upcoming/?page=${page}`);
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function getTopRatedMovies(req: Request, res: Response, next: NextFunction) {
  try {
    const { page } = pageQuerySchema.parse(req.query);
    const { status, payload } = await forwardToCore(`/api/movies/top-rated/?page=${page}`);
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function searchMovies(req: Request, res: Response, next: NextFunction) {
  try {
    const { query, page } = movieSearchQuerySchema.parse(req.query);
    const encodedQuery = encodeURIComponent(query);
    const { status, payload } = await forwardToCore(
      `/api/movies/search/?query=${encodedQuery}&page=${page}`,
    );
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function getMyRecommendations(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user?.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required',
          details: null,
        },
      });
    }

    const { status, payload } = await forwardToCore('/api/movies/recommendations/me/', req, {
      headers: {
        'x-user-id': authReq.user.userId,
      },
    });
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    next(error);
  }
}

export async function getMovieDetails(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tmdb_id } = tmdbIdParamsSchema.parse(req.params);

    const userId = authReq.user?.userId;
    const headers: Record<string, string> = {};
    if (userId) {
      headers['x-user-id'] = userId;
    }

    const [coreResponse, is_in_list] = await Promise.all([
      forwardToCore(`/api/movies/${tmdb_id}/`, req, { headers }),
      userId ? isMovieInWatchlist(userId, tmdb_id) : Promise.resolve(false),
    ]);

    const { status, payload } = coreResponse;

    if (status >= 200 && status < 300) {
      const mergedPayload =
        typeof payload === 'object' && payload !== null
          ? { ...payload, is_in_watchlist: is_in_list }
          : payload;
      const enrichedPayload = await enrichMovieDetailsPayload(mergedPayload);
      return res.status(status).json(enrichedPayload);
    }

    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function getMovieSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { tmdb_id } = tmdbIdParamsSchema.parse(req.params);
    const { status, payload } = await forwardToCore(`/api/movies/ai/${tmdb_id}/summary/`);
    return handleCoreResponse(res, status, payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error);
    }
    next(error);
  }
}

export async function createReview(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user?.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required',
          details: null,
        },
      });
    }

    const body = reviewBodySchema.parse(req.body);

    const { status, payload } = await forwardToCore('/api/movies/review/', undefined, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': authReq.user.userId,
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

export async function updateReview(req: Request, res: Response, next: NextFunction) {
  try {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user?.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required',
          details: null,
        },
      });
    }

    const { review_id } = reviewIdParamsSchema.parse(req.params);
    const body = reviewUpdateBodySchema.parse(req.body);

    const { status, payload } = await forwardToCore(`/api/movies/review/${review_id}/`, undefined, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': authReq.user.userId,
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

    const { status, payload } = await forwardToCore('/api/movies/ai/search/', undefined, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
