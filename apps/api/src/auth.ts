import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import { jwt } from "better-auth/plugins/jwt";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import {
  hasAgencyMembership,
  isKnownHost,
  resetPasswordEmail,
  resolveHost,
  schema,
  sendEmail,
} from "@ownlevel/core";
import { fetchClientMetadataResource } from "./cimd-fetch.js";
import { background, db } from "./db/index.js";
import { transport, fromAddress } from "./email.js";
import { env } from "./env.js";
import { hostConfig } from "./host.js";

/** Scopes an MCP connection can be granted. Mirrors the `scope` of tools in packages/ai/tools. */
export const OAUTH_SCOPES = ["agency:settings", "clients:read", "clients:write", "calendars:write", "offline_access"] as const;

const SELECTION_TTL_MS = 5 * 60 * 1000;

/** The agency picked for the authorization in progress. Short-lived so a stale pick is never reused. */
function selectedAgencyId(session: Record<string, unknown>): string | undefined {
  const id = session.oauthAgencyId;
  const at = session.oauthAgencyAt;
  if (typeof id !== "string" || !(at instanceof Date || typeof at === "string")) return undefined;
  return Date.now() - new Date(at).getTime() <= SELECTION_TTL_MS ? id : undefined;
}

async function sendReset(userId: string, to: string, token: string, request: Request | undefined) {
  if (!request) return console.warn("reset email skipped: no request");
  // The API rewrites the URL to the browser-facing origin, so the link lands on the right host.
  const url = new URL(request.url);
  const resolved = await resolveHost(db, url.host, hostConfig);
  if (!resolved) return console.warn(`reset email skipped: unknown host ${url.host}`);
  // On an agency host, only people with access there get a reset email.
  if (resolved.kind === "agency" && !(await hasAgencyMembership(db, userId, resolved.agencyId))) {
    return console.warn(`reset email skipped: user has no membership on ${url.host}`);
  }
  const appName = resolved.kind === "agency" ? (resolved.branding.appName ?? resolved.name) : "Ownlevel";
  const mail = resetPasswordEmail({ appName, url: `${url.origin}/reset-password?token=${token}` });
  const msg = { from: fromAddress(appName), to, ...mail };
  if (resolved.kind === "agency") await sendEmail(db, transport, { agencyId: resolved.agencyId }, msg);
  else await transport(msg);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: env.authSecret,
  baseURL: env.baseUrl,
  // Origin checks: static dev origins plus any host that resolves to a platform or active agency domain.
  trustedOrigins: async (request) => {
    const origin = request?.headers.get("origin");
    if (!origin) return env.webOrigins;
    try {
      const host = new URL(origin).host;
      return (await isKnownHost(db, host, hostConfig)) ? [...env.webOrigins, origin] : env.webOrigins;
    } catch {
      return env.webOrigins;
    }
  },
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    // Not awaited: response time must not reveal whether the email exists.
    sendResetPassword: async ({ user, token }, request) => {
      background(sendReset(user.id, user.email, token, request));
    },
  },
  // Set by /api/oauth/select-agency while an MCP authorization is in progress; read as the consent reference.
  session: {
    additionalFields: {
      oauthAgencyId: { type: "string", required: false, input: false },
      oauthAgencyAt: { type: "date", required: false, input: false },
    },
  },
  // The JWT plugin's own /token is replaced by the OAuth provider's /oauth2/token.
  disabledPaths: ["/token"],
  plugins: [
    // Hands a session from the platform host to a new agency host (sessions are host-bound).
    oneTimeToken({ expiresIn: 3 }),
    jwt(),
    // OAuth 2.1 authorization server for MCP clients. Login, agency picker and consent live in apps/web.
    mcp({
      resource: env.mcpUrl,
      loginPage: `${env.webUrl}/login`,
      consentPage: `${env.webUrl}/oauth/consent`,
      scopes: [...OAUTH_SCOPES],
      grantTypes: ["authorization_code", "refresh_token"],
      accessTokenExpiresIn: 600,
      allowDynamicClientRegistration: env.oauthOpenRegistration,
      allowUnauthenticatedClientRegistration: env.oauthOpenRegistration,
      clientRegistrationAllowedScopes: [...OAUTH_SCOPES],
      // The user picks which agency this connection acts on; consent is stored per agency.
      postLogin: {
        page: `${env.webUrl}/oauth/select-agency`,
        shouldRedirect: ({ session, isContinuation }) => (isContinuation ? !selectedAgencyId(session) : true),
        consentReferenceId: ({ session }) => {
          const id = selectedAgencyId(session);
          if (!id) throw new Error("no agency selected");
          return id;
        },
      },
      customAccessTokenClaims: ({ referenceId }) => (referenceId ? { agency_id: referenceId } : {}),
    }),
    // Production clients identify themselves by an https metadata URL instead of registering.
    ...(env.oauthCimd ? [cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" })] : []),
  ],
});
