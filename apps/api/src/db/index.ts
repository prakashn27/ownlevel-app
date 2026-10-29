import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "@ownlevel/core";
import { env } from "../env.js";

export const pool = new Pool({ connectionString: env.databaseUrl });
export const db = drizzle(pool, { schema });
