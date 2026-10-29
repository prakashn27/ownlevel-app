import { hasAgencyMembership } from "@ownlevel/core";
import type { ToolContext } from "@ownlevel/ai/tools";
import type { McpDeps } from "./handler.js";
import { db } from "./db.js";

/**
 * LOCAL TESTING ONLY, until Better Auth OAuth is wired. Token: `dev:<userId>:<agencyId>[:scope,scope]`.
 * Identity is still verified against real memberships; the role is checked again inside core on every call.
 */
export function devAuthenticate(): McpDeps["authenticate"] {
  if (process.env.NODE_ENV === "production") throw new Error("dev auth must not run in production");
  return async (req) => {
    const token = req.headers.get("authorization")?.match(/^Bearer dev:(.+)$/)?.[1];
    if (!token) return null;
    const [userId, agencyId, scopes] = token.split(":");
    if (!userId || !agencyId) return null;
    if (!(await hasAgencyMembership(db, userId, agencyId).catch(() => false))) return null;
    const ctx: ToolContext = { db, userId, agencyId, level: "agency", scopes: scopes ? scopes.split(",") : ["agency:settings"] };
    return ctx;
  };
}
