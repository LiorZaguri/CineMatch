jest.mock("../controllers/userPreferenceController", () => {
  const actual = jest.requireActual("../controllers/userPreferenceController");

  return {
    ...actual,
    initializeCorePreferences: jest.fn().mockResolvedValue({
      status: 201,
      payload: null,
    }),
  };
});

import request from "supertest";
import {app} from "../app";

describe("POST /CineMatch/auth/register", () => {
  it("should register and return accessToken + user", async () => {
    const email = `new_${Date.now()}@mail.com`;
    const password = "Password123!";
    const displayName = "New User";

    const res = await request(app)
      .post("/CineMatch/auth/register")
      .send({ email, password, displayName });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("accessToken");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.user).toMatchObject({
      email,
      displayName,
      onboardingStatus: "pending",
    });
    expect(res.body.user).toHaveProperty("id");
  });

  it("should fail with 400 for duplicate email", async () => {
    const email = `dup_${Date.now()}@mail.com`;
    const password = "Password123!";
    const displayName = "Duplicate User";

    await request(app)
      .post("/CineMatch/auth/register")
      .send({ email, password, displayName })
      .expect(201);

    const res = await request(app)
      .post("/CineMatch/auth/register")
      .send({ email, password, displayName });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "EMAIL_ALREADY_EXISTS");
    expect(res.body).toHaveProperty("message");
  });
});
