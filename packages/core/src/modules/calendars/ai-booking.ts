import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { agencies, calendars, clients, withTenant, type Db } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { cancelManagedBooking, bookPublic, getPublicCalendar, getPublicSlots } from "./public.js";
import { localDateTime, localDaysRange } from "./slots.js";
import { bad, text } from "./util.js";

/**
 * Booking through visitors' AI assistants (the public MCP endpoint). Same rules and data as the public booking page:
 * only free times go out, and a booking is made with the details the visitor gives, no sign-in. On top of that the
 * client opts in twice: a switch for the client (`clients.ai_booking`) and one per calendar (`calendars.ai_booking`),
 * and only published calendars count. Anything off looks like it doesn't exist.
 *
 * TODO (abuse): optional email confirmation. The booking stays pending until the visitor opens a link we email them,
 * which stops fake or someone else's email. Not built: today a person is capped at a few upcoming bookings per client
 * (MAX_UPCOMING_PER_PERSON_AI) and the route is rate limited per client.
 */
const MAX_DAYS = 7;
const notFound = () => new DomainError("not_found", "Booking is not available here.");

/** What a visitor's AI can reach at one URL: the client, and the calendars the client chose to offer. */
export async function resolveAiTarget(db: Db, agencySlug: string, clientSlug: string) {
  const slug = agencySlug.toLowerCase();
  const agencyId = await withTenant(db, { slug }, async (tx) => (await tx.select({ id: agencies.id }).from(agencies).where(eq(agencies.slug, slug))).at(0)?.id);
  if (!agencyId) throw notFound();
  return withTenant(db, { agencyId }, async (tx) => {
    const [client] = await tx
      .select({ id: clients.id, name: clients.name, slug: clients.slug })
      .from(clients)
      .where(and(eq(clients.agencyId, agencyId), eq(clients.slug, clientSlug.toLowerCase()), eq(clients.status, "active"), eq(clients.aiBooking, true)));
    if (!client) throw notFound();
    const offered = await tx
      .select({ slug: calendars.slug, name: calendars.name, description: calendars.description, type: calendars.type, durationMin: calendars.durationMin, timezone: calendars.timezone })
      .from(calendars)
      .where(and(eq(calendars.clientId, client.id), eq(calendars.status, "published"), eq(calendars.aiBooking, true)))
      .orderBy(asc(calendars.name));
    return { agencyId, client: { id: client.id, name: client.name, slug: client.slug! }, calendars: offered };
  });
}
export type AiTarget = Awaited<ReturnType<typeof resolveAiTarget>>;

function offered(t: AiTarget, slug: string) {
  const cal = t.calendars.find((c) => c.slug === slug.toLowerCase());
  if (!cal) throw new DomainError("not_found", "That service is not available for booking. Use services_list to see what is.");
  return cal;
}

export const aiServices = (t: AiTarget) => ({
  business: t.client.name,
  services: t.calendars.map((c) => ({ service: c.slug, name: c.name, description: c.description, duration_min: c.durationMin, timezone: c.timezone })),
});

/** What the visitor must give to book: fixed fields and the client's own questions. */
export async function aiServiceDetails(db: Db, t: AiTarget, service: string) {
  offered(t, service);
  const c = await getPublicCalendar(db, t.agencyId, t.client.slug, service.toLowerCase());
  return {
    service: service.toLowerCase(),
    name: c.name,
    description: c.description,
    duration_min: c.duration_min,
    timezone: c.timezone,
    hosts: c.hosts.map((h) => h.name),
    requires: { name: true, email: c.require_email, phone: c.require_phone, email_or_phone: !c.require_email && !c.require_phone },
    questions: c.booking_form,
  };
}

/** Free start times on local days in the calendar's timezone. */
export async function aiSlots(db: Db, t: AiTarget, service: string, date: string, days = 1) {
  const cal = offered(t, service);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) bad("date must look like 2025-06-12.");
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) bad(`days must be 1 to ${MAX_DAYS}.`);
  const { from, to } = localDaysRange(date, days, cal.timezone);
  const r = await getPublicSlots(db, t.agencyId, t.client.slug, cal.slug, { from: new Date(from).toISOString(), to: new Date(to).toISOString() });
  return { timezone: cal.timezone, slots: r.slots.map((s) => ({ starts_at: s.start, local_start: localDateTime(Date.parse(s.start), cal.timezone), ...(s.seats_left === undefined ? {} : { seats_left: s.seats_left }) })) };
}

export type AiBookInput = { service: string; starts_at: string; name: string; email?: string; phone?: string; phone_country?: string; answers?: Record<string, unknown> };

/** Books like the public form does. A retry of the same request within the hour returns the same booking instead of a second one. */
export async function aiBook(db: Db, t: AiTarget, input: AiBookInput) {
  const cal = offered(t, input.service);
  const who = (input.email ?? input.phone ?? "").trim().toLowerCase();
  const key = createHash("sha256").update(`${cal.slug}|${input.starts_at}|${who}|${Math.floor(Date.now() / 3_600_000)}`).digest("hex").slice(0, 40);
  const r = await bookPublic(
    db,
    t.agencyId,
    t.client.slug,
    cal.slug,
    { starts_at: input.starts_at, attendee: { name: input.name, email: input.email, phone: input.phone }, phone_country: input.phone_country, answers: input.answers },
    key,
    "mcp",
  );
  return {
    booked: true,
    service: cal.name,
    starts_at: r.booking.starts_at,
    local_start: localDateTime(Date.parse(r.booking.starts_at), r.booking.timezone),
    timezone: r.booking.timezone,
    manage_token: r.manage_token,
    note: "Keep manage_token: it is the only way to cancel this booking from here.",
  };
}

/** Cancels with the token a booking returned. Only bookings of this client. */
export async function aiCancel(db: Db, t: AiTarget, token: string) {
  const secret = text(token, 300, "manage_token", true)!;
  if (!secret.startsWith(`${t.client.id}.`)) throw new DomainError("not_found", "Booking not found.");
  return cancelManagedBooking(db, t.agencyId, secret);
}
