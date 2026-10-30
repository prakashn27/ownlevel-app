import { hasAgencyMembership } from "@ownlevel/core";
import type { ToolContext } from "@ownlevel/ai/tools";
import type { McpDeps } from "./handler.js";
import { db } from "./db.js";
import { SUPPORTED_SCOPES } from "./oauth-auth.js";

/**
 * LOCAL TESTING ONLY (curl without a browser). Token: `dev:<userId>:<agencyId>[:scope,scope]`.
 * Identity is still verified against real memberships; the role is checked again inside core on every call.
 */
export function devAuthenticate(): McpDeps["authenticate"] {
  // Dev tokens skip OAuth entirely, so they only work when the issuer is local.
  if (process.env.NODE_ENV === "production" || new URL(process.env.OAUTH_ISSUER ?? "http://localhost").hostname !== "localhost") {
    throw new Error("dev auth is for local development only");
  }
  return async (req) => {
    const token = req.headers.get("authorization")?.match(/^Bearer dev:(.+)$/)?.[1];
    if (!token) return null;
    const [userId, agencyId, scopes] = token.split(":");
    if (!userId || !agencyId) return null;
    if (!(await hasAgencyMembership(db, userId, agencyId).catch(() => false))) return null;
    const ctx: ToolContext = { db, userId, agencyId, level: "agency", scopes: scopes ? scopes.split(",") : SUPPORTED_SCOPES };
    return ctx;
  };
}
