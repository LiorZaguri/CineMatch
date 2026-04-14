import express from "express";
import http from "http";
import jwt from "jsonwebtoken";
import request from "supertest";

describe("movie gateway routes", () => {
  let coreApp: express.Express;
  let coreServer: http.Server;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

    coreApp = express();
    coreApp.use(express.json());

    coreApp.get("/api/movies/dashboard/", (_req, res) => {
      res.json({
        now_playing: [],
        popular: [],
        upcoming: [],
        top_rated: [],
      });
    });

    coreApp.get("/api/movies/popular/", (req, res) => {
      res.json({
        source: "core",
        page: Number(req.query.page ?? 1),
      });
    });

    coreApp.get("/api/movies/now-playing/", (req, res) => {
      res.json({
        source: "core",
        page: Number(req.query.page ?? 1),
      });
    });

    coreApp.get("/api/movies/upcoming/", (req, res) => {
      res.json({
        source: "core",
        page: Number(req.query.page ?? 1),
      });
    });

    coreApp.get("/api/movies/top-rated/", (req, res) => {
      res.json({
        source: "core",
        page: Number(req.query.page ?? 1),
      });
    });

    coreApp.get("/api/movies/:tmdb_id/", (req, res) => {
      const id = Number(req.params.tmdb_id);

      if (id === 404) {
        return res.status(404).json({ detail: "Movie not found" });
      }

      res.json({
        id,
        title: "Test Movie",
        reviews: [],
      });
    });

    coreApp.get("/api/movies/:tmdb_id/summary/", (req, res) => {
      const id = Number(req.params.tmdb_id);

      if (id === 404) {
        return res.status(404).json({ detail: "Movie not found" });
      }

      if (id === 500) {
        return res.status(500).json({ detail: "AI Summarization failed." });
      }

      res.json({
        tmdb_id: id,
        summary: "Consensus summary text",
      });
    });

    coreApp.post("/api/movies/review/", (req, res) => {
      const userId = req.header("x-user-id");

      if (!userId) {
        return res.status(401).json({ detail: "Missing user-id" });
      }

      if (req.body.tmdb_id === 999) {
        return res
          .status(400)
          .json({ detail: "You have already reviewed this movie." });
      }

      if (req.body.tmdb_id === 502) {
        return res.status(502).json({ detail: "TMDB unreachable" });
      }

      res.status(201).json({
        ok: true,
        userId,
        body: req.body,
      });
    });

    coreApp.patch("/api/movies/review/:review_id/", (req, res) => {
      const userId = req.header("x-user-id");
      const reviewId = Number(req.params.review_id);

      if (!userId) {
        return res.status(401).json({ detail: "Missing user-id" });
      }

      if (reviewId === 404) {
        return res.status(404).json({ detail: "Review not found." });
      }

      res.json({
        id: reviewId,
        userId,
        ...req.body,
        created_at: "2026-04-14T13:00:00Z",
      });
    });

    await new Promise<void>((resolve) => {
      coreServer = coreApp.listen(0, () => {
        const address = coreServer.address();
        if (address && typeof address === "object") {
          process.env.CORE_SERVICE_URL = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      coreServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function loadApp() {
    jest.resetModules();
    const mod = require("../app");
    return mod.app;
  }

  function makeToken(userId: string) {
    return jwt.sign({ sub: userId }, process.env.JWT_SECRET as string);
  }

  it("allows dashboard without authentication", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/dashboard/")
      .expect(200);

    expect(res.body).toHaveProperty("now_playing");
    expect(res.body).toHaveProperty("popular");
    expect(res.body).toHaveProperty("upcoming");
    expect(res.body).toHaveProperty("top_rated");
  });

  it("forwards page query for popular movies", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/popular/?page=2")
      .expect(200);

    expect(res.body).toMatchObject({
      source: "core",
      page: 2,
    });
  });

  it("returns 400 for invalid page query", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/popular/?page=0")
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("forwards tmdb_id for movie details", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/123/")
      .expect(200);

    expect(res.body).toMatchObject({
      id: 123,
      title: "Test Movie",
    });
  });

  it("maps core 404 for movie details", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/404/")
      .expect(404);

    expect(res.body.error.code).toBe("MOVIE_NOT_FOUND");
  });

  it("forwards tmdb_id for movie summary", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/123/summary/")
      .expect(200);

    expect(res.body).toMatchObject({
      tmdb_id: 123,
      summary: "Consensus summary text",
    });
  });

  it("returns 400 for invalid tmdb_id on movie summary", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/0/summary/")
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps core 404 for movie summary", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/404/summary/")
      .expect(404);

    expect(res.body.error.code).toBe("MOVIE_NOT_FOUND");
  });

  it("maps core 500 for movie summary", async () => {
    const app = await loadApp();

    const res = await request(app)
      .get("/CineMatch/movies/500/summary/")
      .expect(502);

    expect(res.body.error.code).toBe("CORE_REQUEST_FAILED");
  });

  it("rejects review submission without authentication", async () => {
    const app = await loadApp();

    const res = await request(app)
      .post("/CineMatch/movies/review/")
      .send({
        tmdb_id: 123,
        rating: 8,
        content: "This movie was actually very good.",
      })
      .expect(401);

    expect(res.body).toHaveProperty("error");
  });

  it("forwards authenticated review submission with user-id", async () => {
    const app = await loadApp();
    const token = makeToken("user-123");

    const res = await request(app)
      .post("/CineMatch/movies/review/")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tmdb_id: 123,
        rating: 8,
        content: "This movie was actually very good.",
      })
      .expect(201);

    expect(res.body).toMatchObject({
      ok: true,
      userId: "user-123",
    });
    expect(res.body.body).toMatchObject({
      tmdb_id: 123,
      rating: 8,
    });
  });

  it("returns 400 for invalid review body", async () => {
    const app = await loadApp();
    const token = makeToken("user-123");

    const res = await request(app)
      .post("/CineMatch/movies/review/")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tmdb_id: 123,
        rating: 20,
        content: "short",
      })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects review body with blocked profanity", async () => {
    const app = await loadApp();
    const token = makeToken("user-123");

    const res = await request(app)
      .post("/CineMatch/movies/review/")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tmdb_id: 123,
        rating: 8,
        content: "This movie was fucking terrible and insulting.",
      })
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("strips external links before forwarding a review to core", async () => {
    const app = await loadApp();
    const token = makeToken("user-123");

    const res = await request(app)
      .post("/CineMatch/movies/review/")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tmdb_id: 123,
        rating: 8,
        content: "Great movie review at https://spam.example.com definitely worth watching.",
      })
      .expect(201);

    expect(res.body.body.content).toBe("Great movie review at definitely worth watching.");
  });

  it("maps duplicate review error from core", async () => {
    const app = await loadApp();
    const token = makeToken("user-123");

    const res = await request(app)
      .post("/CineMatch/movies/review/")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tmdb_id: 999,
        rating: 9,
        content: "This movie was excellent and worth reviewing.",
      })
      .expect(400);

    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("maps tmdb unavailable error from core", async () => {
    const app = await loadApp();
    const token = makeToken("user-123");

    const res = await request(app)
      .post("/CineMatch/movies/review/")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tmdb_id: 502,
        rating: 9,
        content: "This movie was excellent and worth reviewing.",
      })
      .expect(502);

    expect(res.body.error.code).toBe("CORE_TMDB_UNAVAILABLE");
  });

  it("forwards authenticated review updates with user-id", async () => {
    const app = await loadApp();
    const token = makeToken("user-123");

    const res = await request(app)
      .patch("/CineMatch/movies/review/7/")
      .set("Authorization", `Bearer ${token}`)
      .send({
        rating: 9,
        content: "Updated review copy.",
      })
      .expect(200);

    expect(res.body).toMatchObject({
      id: 7,
      userId: "user-123",
      rating: 9,
      content: "Updated review copy.",
    });
  });
});
