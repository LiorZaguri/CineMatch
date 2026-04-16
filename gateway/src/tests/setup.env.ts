process.env.NODE_ENV = "test";

import dotenv from "dotenv";
dotenv.config({ path: ".env.test", override: true, quiet: true });

process.env.POSTGRES_HOST ||= "localhost";
process.env.POSTGRES_PORT ||= "5433";
process.env.POSTGRES_SSLMODE ||= "disable";
process.env.POSTGRES_CHANNEL_BINDING ||= "disable";
