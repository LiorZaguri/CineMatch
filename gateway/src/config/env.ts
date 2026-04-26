import dotenv from "dotenv";

type NodeEnv = "development" | "test" | "production";

const NODE_ENV = (process.env.NODE_ENV ?? "development") as NodeEnv;

if (NODE_ENV === "test") {
  dotenv.config({
    path: ".env.test",
    override: true,
    quiet: true
  });
} else {
  dotenv.config(); 
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (Number.isNaN(port)) {
    throw new Error("PORT must be a valid number");
  }
  return port;
}

export const env = {
  NODE_ENV,
  PORT: parsePort(process.env.PORT),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "24h",
  CORE_SERVICE_URL: requireEnv("CORE_SERVICE_URL"),
};
