const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://ownlevel:ownlevel@localhost:5432/ownlevel",
  authSecret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
  baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  /** Extra browser origins allowed besides agency hosts (e.g. local dev web). */
  webOrigins: list(process.env.WEB_ORIGINS ?? "http://localhost:3100"),
  /** Agencies live at {slug}.{rootDomain}. "ownlevel.app" in prod, "localhost" in dev. */
  rootDomain: process.env.PLATFORM_ROOT_DOMAIN ?? "localhost",
  /** Hosts serving the platform itself (agency-owner signup). */
  platformHosts: list(process.env.PLATFORM_HOSTS ?? "localhost"),
  /** Shared with the web proxy; X-Forwarded-Host is trusted only when this matches. */
  proxySecret: process.env.PROXY_SHARED_SECRET ?? "dev-proxy-secret-change-me",
  /** Sender address; the display name is the agency's app name. */
  emailFrom: process.env.EMAIL_FROM ?? "noreply@ownlevel.app",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  /** Canonical MCP resource URL; access tokens are audience-bound to it. */
  mcpUrl: process.env.MCP_PUBLIC_URL ?? "http://localhost:4100/mcp",
  /**
   * Web origin serving the login, agency-picker and consent pages. Defaults to the first dev web origin on
   * localhost, otherwise to the platform host.
   */
  webUrl:
    process.env.WEB_URL ??
    (new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:4000").hostname === "localhost"
      ? list(process.env.WEB_ORIGINS ?? "http://localhost:3100")[0]!
      : `https://${list(process.env.PLATFORM_HOSTS ?? "localhost")[0]}`),
  /** Dynamic client registration (RFC 7591): anyone can create an OAuth client. Dev convenience only; off unless set to 1. */
  oauthOpenRegistration: process.env.OAUTH_OPEN_REGISTRATION === "1",
  /** Client ID Metadata Documents: clients are identified by an HTTPS URL we fetch (SSRF-guarded; needs Node, not Workers). */
  oauthCimd: process.env.OAUTH_CIMD !== "0",
};
