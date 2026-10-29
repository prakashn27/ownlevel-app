import { serve } from "@hono/node-server";
import { createMcpHandler } from "./handler.js";
import { devAuthenticate } from "./dev-auth.js";
import { protectedResourceMetadata, withOAuth, type OAuthConfig } from "./oauth-auth.js";

const port = Number(process.env.MCP_PORT ?? 4100);
const oauth: OAuthConfig = {
  issuer: process.env.OAUTH_ISSUER ?? "http://localhost:4000/api/auth",
  resource: process.env.MCP_PUBLIC_URL ?? `http://localhost:${port}/mcp`,
};
// Everything public (challenge URL, metadata) derives from the one resource URL, so it cannot drift.
const resourceUrl = new URL(oauth.resource);
const metadataPath = `/.well-known/oauth-protected-resource${resourceUrl.pathname}`;
const metadataUrl = `${resourceUrl.origin}${metadataPath}`;
if (process.env.NODE_ENV === "production" && (resourceUrl.protocol !== "https:" || !process.env.OAUTH_ISSUER?.startsWith("https://"))) {
  throw new Error("MCP_PUBLIC_URL and OAUTH_ISSUER must be https URLs in production");
}
const audit = async (ctx: { userId: string; agencyId: string }, tool: string, outcome: string) =>
  console.log(`audit user=${ctx.userId} agency=${ctx.agencyId} tool=${tool} ${outcome}`);

// OAuth 2.1 (Better Auth) by default. MCP_DEV_AUTH=1 swaps in the dev-token authenticator for local curl tests.
const authenticate = process.env.MCP_DEV_AUTH === "1" ? devAuthenticate() : null;
const devMcp = authenticate && createMcpHandler({ authenticate, resourceMetadataUrl: metadataUrl, audit });
const oauthMcp = withOAuth(oauth, (req, ctx) => createMcpHandler({ authenticate: async () => ctx, resourceMetadataUrl: metadataUrl, audit })(req));

serve(
  {
    port,
    fetch: (req) => {
      const { pathname } = new URL(req.url);
      if (pathname === "/health" || pathname === "/healthz") return new Response("ok");
      if (pathname === metadataPath || pathname === "/.well-known/oauth-protected-resource") return Response.json(protectedResourceMetadata(oauth));
      if (pathname === resourceUrl.pathname) {
        // Dev tokens are only honoured when MCP_DEV_AUTH=1; anything else goes through real OAuth.
        if (devMcp && req.headers.get("authorization")?.startsWith("Bearer dev:")) return devMcp(req);
        return oauthMcp(req);
      }
      return new Response("Not found", { status: 404 });
    },
  },
  (i) => console.log(`mcp-server listening on http://localhost:${i.port}/mcp (issuer ${oauth.issuer}${devMcp ? ", dev tokens ON" : ""})`),
);
