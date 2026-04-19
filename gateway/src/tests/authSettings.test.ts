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
import { app } from "../app";

async function registerUser() {
  const email = `settings_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@mail.com`;
  const password = "Password123!";
  const displayName = "Settings User";

  const res = await request(app)
    .post("/CineMatch/auth/register")
    .send({ email, password, displayName })
    .expect(201);

  return {
    email,
    password,
    displayName,
    accessToken: res.body.accessToken as string,
  };
}

describe("Authenticated auth settings flows", () => {
  it("should update the displayName for the current user", async () => {
    const user = await registerUser();

    const res = await request(app)
      .patch("/CineMatch/auth/me")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ displayName: "Updated Settings User" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: user.email,
      displayName: "Updated Settings User",
      onboardingStatus: "pending",
    });
  });

  it("should update the onboarding status for the current user", async () => {
    const user = await registerUser();

    const res = await request(app)
      .patch("/CineMatch/auth/me/onboarding-status")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ onboardingStatus: "skipped" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: user.email,
      onboardingStatus: "skipped",
    });

    const loginRes = await request(app)
      .post("/CineMatch/auth/login")
      .send({ email: user.email, password: user.password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user).toMatchObject({
      onboardingStatus: "skipped",
    });
  });

  it("should change the password when the current password is correct", async () => {
    const user = await registerUser();
    const newPassword = "NewPassword123!";

    await request(app)
      .post("/CineMatch/auth/change-password")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ oldPassword: user.password, newPassword })
      .expect(204);

    await request(app)
      .post("/CineMatch/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(401);

    const loginRes = await request(app)
      .post("/CineMatch/auth/login")
      .send({ email: user.email, password: newPassword });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user).toMatchObject({
      email: user.email,
      displayName: user.displayName,
    });
  });

  it("should reject account deletion when the password is incorrect", async () => {
    const user = await registerUser();

    const res = await request(app)
      .delete("/CineMatch/auth/me")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ password: "WrongPassword123!" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "INVALID_PASSWORD");
  });

  it("should delete the account when the password is correct", async () => {
    const user = await registerUser();

    await request(app)
      .delete("/CineMatch/auth/me")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ password: user.password })
      .expect(204);

    await request(app)
      .post("/CineMatch/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(401);
  });
});
