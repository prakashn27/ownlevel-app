import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "../../packages/core/src/db/*-schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ownlevel:ownlevel@localhost:5432/ownlevel",
  },
});
