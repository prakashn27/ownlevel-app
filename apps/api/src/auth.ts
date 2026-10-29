import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import {
  hasAgencyMembership,
  isKnownHost,
  resetPasswordEmail,
  resolveHost,
  schema,
  sendEmail,
} from "@ownlevel/core";
import { background, db } from "./db/index.js";
import { transport, fromAddress } from "./email.js";
import { env } from "./env.js";
import { hostConfig } from "./host.js";

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
  // Hands a session from the platform host to a new agency host (sessions are host-bound).
  plugins: [oneTimeToken({ expiresIn: 3 })],
});
