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

describe("POST /CineMatch/auth/login", () => {
  it("should login and return unified auth response", async () => {
    const email = `ok_${Date.now()}@mail.com`;
    const password = "Password123!";
    const displayName = "Login User";

    await request(app)
      .post("/CineMatch/auth/register")
      .send({ email, password, displayName })
      .expect(201);

    const res = await request(app)
      .post("/CineMatch/auth/login")
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.user).toMatchObject({
      email,
      displayName,
      onboardingStatus: "pending",
    });
    expect(res.body.user).toHaveProperty("id");
  });

  it("should fail with 401 for unregistered email", async () => {
    const res = await request(app)
      .post("/CineMatch/auth/login")
      .send({ email: "noone_" + Date.now() + "@mail.com", password: "Password123!" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "INVALID_CREDENTIALS");
    expect(res.body).toHaveProperty("message");
  });

  it("should fail with 401 for incorrect password", async () => {
    const email = `user_${Date.now()}@mail.com`;

    // register first
    await request(app)
      .post("/CineMatch/auth/register")
      .send({ email, password: "Password123!", displayName: "Wrong Password User" })
      .expect(201);

    // wrong password
    const res = await request(app)
      .post("/CineMatch/auth/login")
      .send({ email, password: "WrongPass123!" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "INVALID_CREDENTIALS");
    expect(res.body).toHaveProperty("message");
  });
});
