import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema, type Db } from "@ownlevel/core";

// Production must connect as the non-owner app role so RLS applies; never fall back to the dev superuser.
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://ownlevel:ownlevel@localhost:5432/ownlevel" });
export const db = drizzle(pool, { schema }) as Db;
