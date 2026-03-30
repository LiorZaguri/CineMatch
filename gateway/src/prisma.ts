import "dotenv/config";
import { env } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { createRequire } from "node:module";
import type { PrismaClient as GeneratedPrismaClient } from "./generated/prisma";

type PrismaClientConstructor = new (options: {
  adapter: PrismaPg;
}) => GeneratedPrismaClient;

const runtimeRequire = createRequire(__filename);

function loadPrismaClient() {
  try {
    return runtimeRequire("./generated/prisma") as {
      PrismaClient: PrismaClientConstructor;
    };
  } catch (error) {
    const moduleError = error as NodeJS.ErrnoException;

    // Support deployments that still rely on the default generated package layout.
    if (moduleError.code !== "MODULE_NOT_FOUND") {
      throw error;
    }

    return runtimeRequire("@prisma/client") as unknown as {
      PrismaClient: PrismaClientConstructor;
    };
  }
}

const { PrismaClient } = loadPrismaClient();

const connectionString = `postgresql://${env("POSTGRES_USER")}:${env("POSTGRES_PASSWORD")}@${env("POSTGRES_HOST")}:${env("POSTGRES_PORT")}/${env("POSTGRES_DB")}?sslmode=require&channel_binding=require`;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
