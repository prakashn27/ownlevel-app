import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  DomainError,
  acceptInvitation,
  createAgency,
  createClient,
  createInvitation,
  getClient,
  getTeam,
  hasAgencyMembership,
  inviteEmail,
  isSlugAvailable,
  listAgencyMemberships,
  listClients,
  previewInvitation,
  resolveHost,
  revokeInvitation,
  session as sessionTable,
  sendEmail,
  updateBranding,
  updateClient,
} from "@ownlevel/core";
import { parseHost } from "@ownlevel/tenancy";
import { eq } from "drizzle-orm";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { fromAddress, transport } from "./email.js";
import { env } from "./env.js";
import { hostConfig, requestHost } from "./host.js";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  host: string;
};

export const app = new Hono<{ Variables: Variables }>();

app.use(
  "/api/*",
  cors({
    origin: env.webOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use("/api/*", async (c, next) => {
  c.set("host", requestHost(c.req.raw.headers).host);
  await next();
});

// better-auth handles /api/auth/*. Rewrite the URL to the browser-facing origin so cookies
// and redirects are issued for the agency's host.
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const { origin } = requestHost(c.req.raw.headers);
  const u = new URL(c.req.url);
  return auth.handler(new Request(new URL(u.pathname + u.search, origin), c.req.raw));
});

// OAuth discovery (RFC 8414 / OIDC) lives at the server root, outside /api/auth.
app.on(["GET", "HEAD"], "/.well-known/*", (c) => auth.handler(c.req.raw));

// Resolve session from cookie for the remaining routes.
app.use("/api/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

/** MCP authorization: the user picks which agency the connection acts on (agency-level memberships only). */
app.post("/api/oauth/select-agency", async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  if (!user || !session) return c.json({ error: "unauthorized" }, 401);
  const { agencyId } = (await c.req.json().catch(() => ({}))) as { agencyId?: unknown };
  if (typeof agencyId !== "string" || !(await hasAgencyMembership(db, user.id, agencyId))) throw new DomainError("not_found", "Agency not found.");
  await db.update(sessionTable).set({ oauthAgencyId: agencyId, oauthAgencyAt: new Date() }).where(eq(sessionTable.id, session.id));
  return c.json({ ok: true });
});

app.onError((err, c) => {
  if (err instanceof DomainError) {
    const status =
      err.code === "slug_taken" ? 409 : err.code === "not_found" ? 404 : err.code === "forbidden" ? 403 : err.code === "unauthorized" ? 401 : 400;
    return c.json({ error: err.code, message: err.message }, status);
  }
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));
app.get("/healthz", (c) => c.json({ ok: true }));

/** Public: who does this hostname belong to? Drives branding on the login page. */
app.get("/api/host", async (c) => {
  const resolved = await resolveHost(db, c.get("host"), hostConfig);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  if (resolved.kind === "platform") return c.json({ kind: "platform" });
  return c.json({
    kind: "agency",
    agencyId: resolved.agencyId,
    name: resolved.name,
    slug: resolved.slug,
    branding: resolved.branding,
  });
});

app.get("/api/slugs/:slug", async (c) => c.json({ available: await isSlugAvailable(db, c.req.param("slug")) }));

app.get("/api/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  // On an agency host, only that agency's memberships are visible.
  const resolved = await resolveHost(db, c.get("host"), hostConfig);
  if (!resolved) return c.json({ error: "not_found" }, 404);
  const agencies = await listAgencyMemberships(db, user.id, resolved.kind === "agency" ? resolved.agencyId : undefined);
  return c.json({ id: user.id, email: user.email, name: user.name, agencies });
});

/** Agency signup. Only on a platform host; the owner is the session user. */
app.post("/api/agencies", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (parseHost(c.get("host"), hostConfig).kind !== "platform") return c.json({ error: "not_found" }, 404);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string") return c.json({ error: "invalid_input", message: "name is required" }, 400);
  const agency = await createAgency(
    db,
    {
      userId: user.id,
      name: body.name,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      currency: typeof body.currency === "string" ? body.currency : undefined,
    },
    hostConfig,
  );
  return c.json({ id: agency.id, name: agency.name, slug: agency.slug, hostname: agency.hostname }, 201);
});

// ── Agency-scoped routes: the agency comes from the host, never from the URL or body ──
type Ctx = Context<{ Variables: Variables }>;

async function agencyHost(c: Ctx) {
  const resolved = await resolveHost(db, c.get("host"), hostConfig);
  if (resolved?.kind !== "agency") throw new DomainError("not_found", "Not found.");
  return resolved;
}

async function agencyCtx(c: Ctx) {
  const user = c.get("user");
  if (!user) throw new DomainError("unauthorized", "Sign in to continue.");
  const resolved = await agencyHost(c);
  return { user, resolved, ctx: { userId: user.id, agencyId: resolved.agencyId } };
}

async function jsonBody(c: Ctx) {
  return ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
}

app.patch("/api/agency/branding", async (c) => {
  const { ctx } = await agencyCtx(c);
  return c.json(await updateBranding(db, ctx, await jsonBody(c)));
});

app.get("/api/team", async (c) => {
  const { ctx } = await agencyCtx(c);
  return c.json(await getTeam(db, ctx));
});

async function sendInvite(c: Ctx, clientId?: string) {
  const { ctx, user, resolved } = await agencyCtx(c);
  const body = await jsonBody(c);
  const inv = await createInvitation(db, ctx, { email: String(body.email ?? ""), roleKey: String(body.role ?? ""), clientId });
  const appName = resolved.branding.appName ?? resolved.name;
  const url = `${requestHost(c.req.raw.headers).origin}/accept-invite?token=${inv.token}`;
  const mail = inviteEmail({ appName, inviterName: user.name, roleName: inv.roleName, url });
  try {
    await sendEmail(db, transport, { agencyId: ctx.agencyId }, { from: fromAddress(appName), to: inv.email, ...mail });
  } catch (err) {
    console.error("invitation email failed", err);
    return c.json(
      { error: "email_failed", message: `The invitation was created but the email to ${inv.email} could not be sent. Check the email provider settings, then revoke and re-invite.` },
      502,
    );
  }
  return c.json({ email: inv.email }, 201);
}

app.post("/api/team/invitations", (c) => sendInvite(c));

// ── Clients: the client id comes from the URL but is always checked against the host's agency ──
app.get("/api/clients", async (c) => {
  const { ctx } = await agencyCtx(c);
  return c.json(await listClients(db, ctx));
});

app.post("/api/clients", async (c) => {
  const { ctx } = await agencyCtx(c);
  return c.json(await createClient(db, ctx, await jsonBody(c)), 201);
});

app.get("/api/clients/:clientId", async (c) => {
  const { ctx } = await agencyCtx(c);
  return c.json(await getClient(db, ctx, c.req.param("clientId")));
});

app.patch("/api/clients/:clientId", async (c) => {
  const { ctx } = await agencyCtx(c);
  return c.json(await updateClient(db, ctx, c.req.param("clientId"), await jsonBody(c)));
});

app.get("/api/clients/:clientId/team", async (c) => {
  const { ctx } = await agencyCtx(c);
  return c.json(await getTeam(db, ctx, c.req.param("clientId")));
});

app.post("/api/clients/:clientId/invitations", (c) => sendInvite(c, c.req.param("clientId")));

app.delete("/api/team/invitations/:id", async (c) => {
  const { ctx } = await agencyCtx(c);
  await revokeInvitation(db, ctx, c.req.param("id"));
  return c.json({ ok: true });
});

/** Public: what is this invitation for? Scoped to the host's agency. */
app.get("/api/invitations/preview", async (c) => {
  const resolved = await agencyHost(c);
  const token = c.req.query("token") ?? "";
  return c.json({ agencyName: resolved.branding.appName ?? resolved.name, ...(await previewInvitation(db, resolved.agencyId, token)) });
});

app.post("/api/invitations/accept", async (c) => {
  const { user, ctx } = await agencyCtx(c);
  const body = await jsonBody(c);
  await acceptInvitation(db, { ...ctx, userEmail: user.email }, String(body.token ?? ""));
  return c.json({ ok: true });
});
