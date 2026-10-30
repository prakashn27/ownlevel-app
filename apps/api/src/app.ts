import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  DomainError,
  acceptInvitation,
  addHost,
  bookPublic,
  cancelManagedBooking,
  getBookingSettings,
  getManagedBooking,
  getPublicCalendar,
  getPublicSlots,
  updateBookingSettings,
  archiveCalendar,
  clearOverride,
  createAppointment,
  createCalendar,
  getAppointment,
  getCalendar,
  getSlots,
  listAppointments,
  listContactAppointments,
  listCalendars,
  listEligibleHosts,
  removeHost,
  setOverride,
  updateAppointment,
  updateAttendee,
  updateCalendar,
  createAgency,
  createClient,
  createField,
  createInvitation,
  createRecord,
  deleteField,
  deleteRecord,
  fieldUsage,
  getClient,
  getMetadata,
  getRecord,
  getTeam,
  hasAgencyMembership,
  hasClientMembership,
  inviteEmail,
  isSlugAvailable,
  listAgencyMemberships,
  listClients,
  listConnectTargets,
  listRecords,
  previewInvitation,
  resolveHost,
  revokeInvitation,
  session as sessionTable,
  sendEmail,
  updateBranding,
  updateClient,
  updateField,
  updateRecord,
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

/** MCP authorization: where the connection can act (agency-level memberships, and clients the user belongs to). */
app.get("/api/oauth/targets", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json(await listConnectTargets(db, user.id));
});

/** MCP authorization: the user picks the agency, or one client (`clientId`), the connection acts on. */
app.post("/api/oauth/select-agency", async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  if (!user || !session) return c.json({ error: "unauthorized" }, 401);
  const { agencyId, clientId } = (await c.req.json().catch(() => ({}))) as { agencyId?: unknown; clientId?: unknown };
  if (typeof agencyId !== "string") throw new DomainError("not_found", "Agency not found.");
  if (clientId !== undefined) {
    if (typeof clientId !== "string" || !(await hasClientMembership(db, user.id, agencyId, clientId))) throw new DomainError("not_found", "Client not found.");
  } else if (!(await hasAgencyMembership(db, user.id, agencyId))) throw new DomainError("not_found", "Agency not found.");
  await db
    .update(sessionTable)
    .set({ oauthAgencyId: agencyId, oauthClientId: (clientId as string | undefined) ?? null, oauthAgencyAt: new Date() })
    .where(eq(sessionTable.id, session.id));
  return c.json({ ok: true });
});

app.onError((err, c) => {
  if (err instanceof DomainError) {
    const status =
      err.code === "slug_taken" || err.code === "conflict" ? 409 : err.code === "rate_limited" ? 429 : err.code === "not_found" ? 404 : err.code === "forbidden" ? 403 : err.code === "unauthorized" ? 401 : 400;
    return c.json({ error: err.code, message: err.message, ...err.details }, status);
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
      country: typeof body.country === "string" ? body.country : undefined,
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

// ── CRM (contacts): client-scoped only. There is no agency-wide route; RLS would return nothing anyway. ──
async function crmScope(c: Ctx) {
  const { ctx } = await agencyCtx(c);
  return { ...ctx, clientId: c.req.param("clientId") ?? "" };
}

app.get("/api/clients/:clientId/crm/metadata/:object", async (c) => c.json(await getMetadata(db, await crmScope(c), c.req.param("object"))));

app.post("/api/clients/:clientId/crm/metadata/:object/fields", async (c) =>
  c.json(await createField(db, await crmScope(c), c.req.param("object"), await jsonBody(c)), 201));

app.get("/api/clients/:clientId/crm/metadata/:object/fields/:key/usage", async (c) =>
  c.json(await fieldUsage(db, await crmScope(c), c.req.param("object"), c.req.param("key"))));

app.patch("/api/clients/:clientId/crm/metadata/:object/fields/:key", async (c) =>
  c.json(await updateField(db, await crmScope(c), c.req.param("object"), c.req.param("key"), await jsonBody(c))));

app.delete("/api/clients/:clientId/crm/metadata/:object/fields/:key", async (c) =>
  c.json(await deleteField(db, await crmScope(c), c.req.param("object"), c.req.param("key"))));

app.get("/api/clients/:clientId/crm/:object", async (c) => {
  const scope = await crmScope(c);
  let filter: { key: string; op: string; value?: unknown }[] | undefined;
  const raw = c.req.query("filter");
  if (raw) {
    try { filter = JSON.parse(raw); } catch { throw new DomainError("invalid_input", "filter must be JSON."); }
    if (!Array.isArray(filter) || filter.some((f) => typeof f?.key !== "string" || typeof f?.op !== "string")) throw new DomainError("invalid_input", "filter must be a list of {key, op, value}.");
  }
  const limit = c.req.query("limit");
  return c.json(await listRecords(db, scope, c.req.param("object"), { q: c.req.query("q"), filter, sort: c.req.query("sort"), cursor: c.req.query("cursor"), limit: limit ? Number(limit) : undefined }));
});

app.post("/api/clients/:clientId/crm/:object", async (c) => c.json(await createRecord(db, await crmScope(c), c.req.param("object"), await jsonBody(c)), 201));

app.get("/api/clients/:clientId/crm/contacts/:contactId/appointments", async (c) => c.json(await listContactAppointments(db, await crmScope(c), c.req.param("contactId"))));

app.get("/api/clients/:clientId/crm/:object/:id", async (c) => c.json(await getRecord(db, await crmScope(c), c.req.param("object"), c.req.param("id"))));

app.patch("/api/clients/:clientId/crm/:object/:id", async (c) =>
  c.json(await updateRecord(db, await crmScope(c), c.req.param("object"), c.req.param("id"), await jsonBody(c))));

/** Permanent: erases the record and everything about it. */
app.delete("/api/clients/:clientId/crm/:object/:id", async (c) => c.json(await deleteRecord(db, await crmScope(c), c.req.param("object"), c.req.param("id"))));

// ── Calendars: client-scoped. Appointments hold attendee details, so there is no agency-wide route. ──
app.get("/api/clients/:clientId/calendars", async (c) => c.json(await listCalendars(db, await crmScope(c), { status: c.req.query("status") })));
app.post("/api/clients/:clientId/calendars", async (c) => c.json(await createCalendar(db, await crmScope(c), await jsonBody(c)), 201));
app.get("/api/clients/:clientId/calendars/eligible-hosts", async (c) => c.json(await listEligibleHosts(db, await crmScope(c))));
app.get("/api/clients/:clientId/calendars/:id", async (c) => c.json(await getCalendar(db, await crmScope(c), c.req.param("id"))));
app.patch("/api/clients/:clientId/calendars/:id", async (c) => c.json(await updateCalendar(db, await crmScope(c), c.req.param("id"), await jsonBody(c))));
/** Archives; appointments are kept. */
app.delete("/api/clients/:clientId/calendars/:id", async (c) => c.json(await archiveCalendar(db, await crmScope(c), c.req.param("id"))));
app.get("/api/clients/:clientId/calendars/:id/slots", async (c) => c.json(await getSlots(db, await crmScope(c), c.req.param("id"), { from: c.req.query("from"), to: c.req.query("to") })));
app.put("/api/clients/:clientId/calendars/:id/hosts/:userId", async (c) => c.json(await addHost(db, await crmScope(c), c.req.param("id"), c.req.param("userId"), await c.req.json().catch(() => ({})))));
app.delete("/api/clients/:clientId/calendars/:id/hosts/:userId", async (c) => c.json(await removeHost(db, await crmScope(c), c.req.param("id"), c.req.param("userId"))));
app.put("/api/clients/:clientId/calendars/:id/overrides/:date", async (c) => c.json(await setOverride(db, await crmScope(c), c.req.param("id"), c.req.param("date"), await jsonBody(c))));
app.delete("/api/clients/:clientId/calendars/:id/overrides/:date", async (c) => c.json(await clearOverride(db, await crmScope(c), c.req.param("id"), c.req.param("date"))));

app.get("/api/clients/:clientId/appointments", async (c) => {
  const limit = c.req.query("limit");
  return c.json(
    await listAppointments(db, await crmScope(c), {
      from: c.req.query("from"),
      to: c.req.query("to"),
      calendarId: c.req.query("calendarId"),
      hostId: c.req.query("hostId"),
      status: c.req.query("status"),
      cursor: c.req.query("cursor"),
      limit: limit ? Number(limit) : undefined,
    }),
  );
});
app.post("/api/clients/:clientId/appointments", async (c) => c.json(await createAppointment(db, await crmScope(c), await jsonBody(c)), 201));
app.get("/api/clients/:clientId/appointments/:id", async (c) => c.json(await getAppointment(db, await crmScope(c), c.req.param("id"))));
app.patch("/api/clients/:clientId/appointments/:id", async (c) => c.json(await updateAppointment(db, await crmScope(c), c.req.param("id"), await jsonBody(c))));
app.patch("/api/clients/:clientId/appointments/:id/attendees/:attendeeId", async (c) =>
  c.json(await updateAttendee(db, await crmScope(c), c.req.param("id"), c.req.param("attendeeId"), await jsonBody(c))));

// Booking address and phone default country of a client.
app.get("/api/clients/:clientId/booking-settings", async (c) => c.json(await getBookingSettings(db, await crmScope(c))));
app.patch("/api/clients/:clientId/booking-settings", async (c) => c.json(await updateBookingSettings(db, await crmScope(c), await jsonBody(c))));

// ── Public booking: no session. The agency comes from the host; the page from the URL. ──
type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
type PublicEnv = { PUBLIC_IP_LIMITER?: Limiter; PUBLIC_CALENDAR_LIMITER?: Limiter; BOOK_IP_LIMITER?: Limiter };

const clientIp = (c: Ctx) => c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

/** Workers rate-limit bindings (see wrangler.jsonc). Not available on Node, where nothing is limited. */
async function throttle(c: Ctx, ...checks: [keyof PublicEnv, string][]) {
  const bindings = c.env as PublicEnv | undefined;
  for (const [name, key] of checks) {
    const limiter = bindings?.[name];
    if (limiter && !(await limiter.limit({ key })).success) throw new DomainError("rate_limited", "Too many requests. Please wait a moment and try again.");
  }
}

let warnedTurnstile = false;
async function verifyTurnstile(token: unknown, ip: string) {
  if (!env.turnstileSecret) {
    if (!warnedTurnstile) { warnedTurnstile = true; console.warn("TURNSTILE_SECRET is not set: public bookings are not bot-checked."); }
    return;
  }
  const body = new URLSearchParams({ secret: env.turnstileSecret, response: typeof token === "string" ? token : "", remoteip: ip });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body }).catch(() => null);
  const ok = res?.ok && ((await res.json().catch(() => null)) as { success?: boolean } | null)?.success === true;
  if (!ok) throw new DomainError("invalid_input", "We couldn't verify you're human. Please try again.");
}

// The attendee's own booking, through the link they were given. Registered first: "manage" is a reserved client slug.
app.get("/api/public/booking/manage/:token", async (c) => {
  await throttle(c, ["PUBLIC_IP_LIMITER", `manage:${clientIp(c)}`]);
  return c.json(await getManagedBooking(db, (await agencyHost(c)).agencyId, c.req.param("token")));
});
app.post("/api/public/booking/manage/:token/cancel", async (c) => {
  await throttle(c, ["BOOK_IP_LIMITER", `cancel:${clientIp(c)}`]);
  return c.json(await cancelManagedBooking(db, (await agencyHost(c)).agencyId, c.req.param("token")));
});

const pageKey = (c: Ctx) => `${c.req.param("clientSlug")}/${c.req.param("calendarSlug")}`;

app.get("/api/public/booking/:clientSlug/:calendarSlug", async (c) => {
  const { agencyId, branding, name } = await agencyHost(c);
  await throttle(c, ["PUBLIC_IP_LIMITER", `page:${clientIp(c)}`], ["PUBLIC_CALENDAR_LIMITER", `${agencyId}:${pageKey(c)}`]);
  return c.json({ ...(await getPublicCalendar(db, agencyId, c.req.param("clientSlug"), c.req.param("calendarSlug"))), agency: { name, branding } });
});

app.get("/api/public/booking/:clientSlug/:calendarSlug/slots", async (c) => {
  const { agencyId } = await agencyHost(c);
  await throttle(c, ["PUBLIC_IP_LIMITER", `slots:${clientIp(c)}`], ["PUBLIC_CALENDAR_LIMITER", `${agencyId}:${pageKey(c)}`]);
  return c.json(await getPublicSlots(db, agencyId, c.req.param("clientSlug"), c.req.param("calendarSlug"), { from: c.req.query("from"), to: c.req.query("to") }));
});

app.post("/api/public/booking/:clientSlug/:calendarSlug/book", async (c) => {
  const { agencyId } = await agencyHost(c);
  const ip = clientIp(c);
  await throttle(c, ["BOOK_IP_LIMITER", `book:${ip}`], ["PUBLIC_CALENDAR_LIMITER", `${agencyId}:${pageKey(c)}`]);
  const body = await jsonBody(c);
  await verifyTurnstile(body.turnstile_token, ip);
  return c.json(await bookPublic(db, agencyId, c.req.param("clientSlug"), c.req.param("calendarSlug"), body, c.req.header("idempotency-key")), 201);
});
