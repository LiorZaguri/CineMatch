import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const sslMode = process.env.POSTGRES_SSLMODE ?? "require";
const channelBinding = process.env.POSTGRES_CHANNEL_BINDING ?? "require";
const query = new URLSearchParams({
  sslmode: sslMode,
  channel_binding: channelBinding,
});

const DATABASE_URL = `postgresql://${env("POSTGRES_USER")}:${env("POSTGRES_PASSWORD")}@${env("POSTGRES_HOST")}:${env("POSTGRES_PORT")}/${env("POSTGRES_DB")}?${query.toString()}`;
process.env.DATABASE_URL = DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: DATABASE_URL,
  },
});
