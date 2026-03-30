import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const DATABASE_URL = `postgresql://${env("POSTGRES_USER")}:${env("POSTGRES_PASSWORD")}@${env("POSTGRES_HOST")}:${env("POSTGRES_PORT")}/${env("POSTGRES_DB")}?sslmode=require&channel_binding=require`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: DATABASE_URL,
  },
});