import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/index.js";
import * as schema from "./db/auth-schema.js";
import { env } from "./env.js";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: env.authSecret,
  baseURL: env.baseUrl,
  trustedOrigins: env.webOrigins,
  emailAndPassword: { enabled: true },
});
