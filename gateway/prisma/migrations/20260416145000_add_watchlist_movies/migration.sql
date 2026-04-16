-- CreateTable
CREATE TABLE "watchlist_movies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_movies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_movies_userId_tmdbId_key" ON "watchlist_movies"("userId", "tmdbId");

-- CreateIndex
CREATE INDEX "watchlist_movies_userId_createdAt_idx" ON "watchlist_movies"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "watchlist_movies" ADD CONSTRAINT "watchlist_movies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
