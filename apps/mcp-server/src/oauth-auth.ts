import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { hasAgencyMembership } from "@ownlevel/core";
import type { ToolContext } from "@ownlevel/ai/tools";
import { db } from "./db.js";

/** Scopes tools can require; advertised in 401 challenges and protected-resource metadata. */
export const SUPPORTED_SCOPES = ["agency:settings", "offline_access"];

export type OAuthConfig = {
  /** Authorization server issuer (the API's Better Auth base URL incl. /api/auth). */
  issuer: string;
  /** This server's canonical resource URL; tokens must be audience-bound to it. */
  resource: string;
};

/** RFC 9728 protected-resource metadata. */
export const protectedResourceMetadata = (c: OAuthConfig) => ({
  resource: c.resource,
  authorization_servers: [c.issuer],
  bearer_methods_supported: ["header"],
  scopes_supported: SUPPORTED_SCOPES.filter((s) => s !== "offline_access"),
});

/**
 * Verifies the Bearer JWT (signature via the AS's JWKS, issuer, audience, expiry) and hands the verified
 * claims to `next`. Identity is then re-checked against live Postgres state on every request, so a removed
 * membership stops working before the token expires.
 */
export function withOAuth(c: OAuthConfig, next: (req: Request, ctx: ToolContext | null) => Promise<Response>) {
  return createMcpProtectedRequestHandler(
    { issuer: c.issuer, audience: c.resource, jwksUrl: `${c.issuer}/jwks`, challengeScopes: ["agency:settings"] },
    async (req, claims) => {
      const userId = claims.sub;
      const agencyId = typeof claims.agency_id === "string" ? claims.agency_id : undefined;
      const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
      if (!userId || !agencyId || !(await hasAgencyMembership(db, userId, agencyId).catch(() => false))) return next(req, null);
      return next(req, { db, userId, agencyId, level: "agency", scopes });
    },
  );
}
