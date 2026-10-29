import { createRemoteJWKSet, jwtVerify } from "jose";
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
  /** Where to fetch signing keys. Defaults to `${issuer}/jwks`; point at the API directly to skip the web hop. */
  jwksUrl?: string;
};

/** RFC 9728 protected-resource metadata. */
export const protectedResourceMetadata = (c: OAuthConfig) => ({
  resource: c.resource,
  authorization_servers: [c.issuer],
  bearer_methods_supported: ["header"],
  scopes_supported: SUPPORTED_SCOPES.filter((s) => s !== "offline_access"),
});

/**
 * Verifies the Bearer JWT (signature via the AS's JWKS, issuer, audience, expiry), then re-checks identity
 * against live Postgres state on every request, so a removed membership stops working before the token
 * expires. `next` gets a null context when the token is valid but no longer maps to an agency member.
 *
 * (Not @better-auth/mcp's request handler: bundling it next to the MCP SDK breaks on Workers because two zod
 * module graphs initialise in the wrong order. Verification is plain `jose`.)
 */
export function withOAuth(c: OAuthConfig, metadataUrl: string, next: (req: Request, ctx: ToolContext | null) => Promise<Response>) {
  const jwks = createRemoteJWKSet(new URL(c.jwksUrl ?? `${c.issuer}/jwks`));
  const unauthorized = (error?: "invalid_token") =>
    new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: error ? "invalid token" : "missing authorization header" }, id: null }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer${error ? ` error="${error}",` : ""} resource_metadata="${metadataUrl}", scope="agency:settings"`,
      },
    });

  return async (req: Request): Promise<Response> => {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return unauthorized();
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, jwks, { issuer: c.issuer, audience: c.resource }));
    } catch {
      return unauthorized("invalid_token");
    }
    const userId = claims.sub;
    const agencyId = typeof claims.agency_id === "string" ? claims.agency_id : undefined;
    const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
    if (!userId || !agencyId || !(await hasAgencyMembership(db, userId, agencyId).catch(() => false))) return next(req, null);
    return next(req, { db, userId, agencyId, level: "agency", scopes });
  };
}
