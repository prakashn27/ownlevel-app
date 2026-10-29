import { createMcpHandler } from "./handler.js";
import { devAuthenticate } from "./dev-auth.js";
import { protectedResourceMetadata, withOAuth, type OAuthConfig } from "./oauth-auth.js";

const isLocal = (u: URL) => u.hostname === "localhost" || u.hostname === "127.0.0.1";

function build() {
  const oauth: OAuthConfig = {
    issuer: process.env.OAUTH_ISSUER ?? "http://localhost:4000/api/auth",
    resource: process.env.MCP_PUBLIC_URL ?? `http://localhost:${process.env.MCP_PORT ?? 4100}/mcp`,
    jwksUrl: process.env.OAUTH_JWKS_URL,
  };
  // Everything public (challenge URL, metadata) derives from the one resource URL, so it cannot drift.
  const resourceUrl = new URL(oauth.resource);
  const metadataPath = `/.well-known/oauth-protected-resource${resourceUrl.pathname}`;
  const metadataUrl = `${resourceUrl.origin}${metadataPath}`;
  for (const u of [resourceUrl, new URL(oauth.issuer)]) {
    if (!isLocal(u) && u.protocol !== "https:") throw new Error(`MCP_PUBLIC_URL and OAUTH_ISSUER must be https (got ${u.href})`);
  }
  const audit = async (ctx: { userId: string; agencyId: string }, tool: string, outcome: string) =>
    console.log(`audit user=${ctx.userId} agency=${ctx.agencyId} tool=${tool} ${outcome}`);

  // OAuth 2.1 (Better Auth). MCP_DEV_AUTH=1 additionally accepts dev tokens, local only (see dev-auth.ts).
  const dev = process.env.MCP_DEV_AUTH === "1" ? createMcpHandler({ authenticate: devAuthenticate(), resourceMetadataUrl: metadataUrl, audit }) : null;
  const oauthMcp = withOAuth(oauth, metadataUrl, (req, ctx) => createMcpHandler({ authenticate: async () => ctx, resourceMetadataUrl: metadataUrl, audit })(req));

  return async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    if (pathname === "/health" || pathname === "/healthz") return new Response("ok");
    if (pathname === metadataPath || pathname === "/.well-known/oauth-protected-resource") return Response.json(protectedResourceMetadata(oauth));
    if (pathname === resourceUrl.pathname) {
      if (dev && req.headers.get("authorization")?.startsWith("Bearer dev:")) return dev(req);
      return oauthMcp(req);
    }
    return new Response("Not found", { status: 404 });
  };
}

let handler: ReturnType<typeof build> | undefined;
/** The whole HTTP surface of the MCP server; shared by the Worker and the local Node server. */
export const handle = (req: Request) => (handler ??= build())(req);
