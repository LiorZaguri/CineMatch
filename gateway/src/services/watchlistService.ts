import { prisma } from "../prisma";
import { randomUUID } from "node:crypto";

export type WatchlistEntry = {
  id: string;
  tmdbId: number;
  createdAt: Date;
};

export async function listWatchlist(userId: string): Promise<WatchlistEntry[]> {
  const entries = await prisma.$queryRaw<WatchlistEntry[]>`
    SELECT
      id,
      "tmdbId" AS "tmdbId",
      "createdAt" AS "createdAt"
    FROM watchlist_movies
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
  `;

  return entries;
}

export async function addWatchlistMovie(userId: string, tmdbId: number): Promise<WatchlistEntry> {
  const id = randomUUID();
  const [entry] = await prisma.$queryRaw<WatchlistEntry[]>`
    INSERT INTO watchlist_movies (id, "userId", "tmdbId")
    VALUES (${id}, ${userId}, ${tmdbId})
    ON CONFLICT ("userId", "tmdbId")
    DO UPDATE SET "tmdbId" = EXCLUDED."tmdbId"
    RETURNING
      id,
      "tmdbId" AS "tmdbId",
      "createdAt" AS "createdAt"
  `;

  if (!entry) {
    throw new Error("Failed to add movie to watchlist");
  }

  return entry;
}

export async function removeWatchlistMovie(userId: string, tmdbId: number): Promise<boolean> {
  const result = await prisma.$executeRaw`
    DELETE FROM watchlist_movies
    WHERE "userId" = ${userId} AND "tmdbId" = ${tmdbId}
  `;

  return result > 0;
}

export async function isMovieInWatchlist(userId: string, tmdbId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1
      FROM watchlist_movies
      WHERE "userId" = ${userId} AND "tmdbId" = ${tmdbId}
    ) AS "exists"
  `;

  return rows[0]?.exists ?? false;
}
