import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { appointmentAttendees, appointments, calendarHosts, calendars, clients, user, withTenant, type Db, type Tx } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { loadFields } from "../crm/index.js";
import { objectDef } from "../crm/objects.js";
import { book, cancelAll, withRetry } from "./appointments.js";
import { loadCalendar, slotsFor } from "./calendars.js";
import { defaultCountry, normalizePhone } from "./contacts.js";
import { parseBookingForm, validateAnswers, type BookingField } from "./form.js";
import { UUID, bad, instant, text } from "./util.js";

/**
 * Public booking. No session: the agency comes from the host (resolved by the caller), the client and calendar from
 * the URL slugs. Only published calendars of active clients are reachable. Visitors only ever see free slots, seats
 * left and their own booking, never other appointments or attendee data.
 */
const MAX_WINDOW_DAYS = 45; // a month grid plus the days around it
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const notFound = () => new DomainError("not_found", "Booking page not found.");

/** Finds the page in agency context (configuration only); everything after runs in the client's context. */
async function resolve(db: Db, agencyId: string, clientSlug: string, calendarSlug: string) {
  return withTenant(db, { agencyId }, async (tx) => {
    const [client] = await tx.select({ id: clients.id, name: clients.name, timezone: clients.timezone }).from(clients).where(and(eq(clients.agencyId, agencyId), eq(clients.slug, clientSlug.toLowerCase()), eq(clients.status, "active")));
    if (!client) throw notFound();
    const [cal] = await tx.select({ id: calendars.id }).from(calendars).where(and(eq(calendars.clientId, client.id), eq(calendars.slug, calendarSlug.toLowerCase()), eq(calendars.status, "published")));
    if (!cal) throw notFound();
    return { client, calendarId: cal.id };
  });
}

const inClient = <T>(db: Db, agencyId: string, clientId: string, fn: (tx: Tx) => Promise<T>) => withTenant(db, { agencyId, clientId }, fn);

export async function getPublicCalendar(db: Db, agencyId: string, clientSlug: string, calendarSlug: string) {
  const { client, calendarId } = await resolve(db, agencyId, clientSlug, calendarSlug);
  return inClient(db, agencyId, client.id, async (tx) => {
    const cal = await loadCalendar(tx, client.id, calendarId);
    const hosts = await tx.select({ name: user.name }).from(calendarHosts).innerJoin(user, eq(user.id, calendarHosts.userId)).where(eq(calendarHosts.calendarId, cal.id)).orderBy(asc(user.name));
    return {
      client_name: client.name,
      name: cal.name,
      description: cal.description,
      type: cal.type,
      duration_min: cal.durationMin,
      capacity: cal.capacity,
      timezone: cal.timezone,
      default_country: await defaultCountry(tx, client.id, cal.defaultCountry),
      require_email: cal.requireEmail,
      require_phone: cal.requirePhone,
      booking_form: cal.bookingForm as BookingField[],
      hosts: hosts.map((h) => ({ name: h.name })),
    };
  });
}

export async function getPublicSlots(db: Db, agencyId: string, clientSlug: string, calendarSlug: string, q: { from?: string; to?: string }) {
  const from = instant(q.from, "from");
  const to = instant(q.to, "to");
  if (to <= from) bad("to must be after from.");
  if (to - from > MAX_WINDOW_DAYS * 86_400_000) bad(`The window can be at most ${MAX_WINDOW_DAYS} days.`);
  const { client, calendarId } = await resolve(db, agencyId, clientSlug, calendarSlug);
  return inClient(db, agencyId, client.id, async (tx) => {
    const cal = await loadCalendar(tx, client.id, calendarId);
    // Which host is free is not the visitor's business.
    return { timezone: cal.timezone, slots: (await slotsFor(tx, cal, from, to)).map((s) => ({ start: s.start, end: s.end, ...(s.seatsLeft === undefined ? {} : { seats_left: s.seatsLeft }) })) };
  });
}

export type PublicBooking = {
  booking: { starts_at: string; ends_at: string; calendar_name: string; timezone: string };
  manage_token: string | null;
  replayed: boolean;
};

export async function bookPublic(db: Db, agencyId: string, clientSlug: string, calendarSlug: string, input: Record<string, unknown>, idempotencyKey?: string): Promise<PublicBooking> {
  if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) bad("Idempotency-Key must be 8 to 100 letters, digits, - or _.");
  const start = instant(input.starts_at, "starts_at");
  const a = input.attendee && typeof input.attendee === "object" ? (input.attendee as Record<string, unknown>) : bad("attendee is required.");
  const name = text(a.name, 120, "Name", true)!;
  const email = text(a.email, 254, "Email")?.toLowerCase();
  if (email && !EMAIL.test(email)) bad("Email is not valid.");
  const phone = text(a.phone, 40, "Phone");
  const phoneCountry = text(input.phone_country, 2, "phone_country")?.toUpperCase();
  const timezone = text(a.timezone, 64, "Timezone");
  const { client, calendarId } = await resolve(db, agencyId, clientSlug, calendarSlug);

  const result = await withRetry(() =>
    inClient(db, agencyId, client.id, async (tx) => {
      const cal = await loadCalendar(tx, client.id, calendarId);
      if (cal.requireEmail && !email) bad("Email is required.");
      if (cal.requirePhone && !phone) bad("Phone is required.");
      if (!email && !phone) bad("Give a phone number or an email.");
      const country = phoneCountry ?? (await defaultCountry(tx, client.id, cal.defaultCountry));
      const form = parseBookingForm(cal.bookingForm);
      const { answers, mapped } = validateAnswers(form, input.answers, (v) => normalizePhone(v, country).e164);

      // Answers saved to contact fields: select options are stored by id, the form shows labels.
      const contactFields = form.some((f) => f.contactFieldKey) ? await loadFields(tx, client.id, objectDef("contacts")) : [];
      for (const [key, v] of Object.entries(mapped)) {
        const f = contactFields.find((x) => x.key === key);
        if (!f || !f.active || !f.contactInput) { delete mapped[key]; continue; }
        const byLabel = (x: unknown) => f.options?.find((o) => o.label.toLowerCase() === String(x).toLowerCase() || o.id === x)?.id;
        if (f.type === "select") mapped[key] = byLabel(v);
        else if (f.type === "multi_select") mapped[key] = (v as unknown[]).map(byLabel);
      }

      return book(tx, { agencyId, clientId: client.id }, cal, {
        calendarId, start, attendee: { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(timezone ? { timezone } : {}) },
        phoneCountry: phoneCountry && /^[A-Z]{2}$/.test(phoneCountry) ? phoneCountry : undefined,
        answers, mapped, source: "public", userId: null, idempotencyKey,
      }).then((b) => ({ b, cal }));
    }),
  );
  return {
    booking: { starts_at: result.b.appointment.starts_at, ends_at: result.b.appointment.ends_at, calendar_name: result.cal.name, timezone: result.cal.timezone },
    manage_token: result.b.token ?? null,
    replayed: !!result.b.replayed,
  };
}

// ── The attendee's own booking, through the link they were given ──
async function managed(tx: Tx, clientId: string, attendeeId: string, secret: string) {
  const [att] = await tx.select().from(appointmentAttendees).where(and(eq(appointmentAttendees.id, attendeeId), eq(appointmentAttendees.clientId, clientId)));
  const want = att?.manageTokenHash ? Buffer.from(att.manageTokenHash) : null;
  const got = Buffer.from(createHash("sha256").update(secret).digest("hex"));
  if (!att || !want || want.length !== got.length || !timingSafeEqual(want, got)) throw notFound();
  const [appt] = await tx.select().from(appointments).where(eq(appointments.id, att.appointmentId));
  const cal = await loadCalendar(tx, clientId, appt!.calendarId);
  return { att, appt: appt!, cal };
}

function parseToken(token: string) {
  const [clientId, attendeeId, secret, extra] = token.split(".");
  if (extra !== undefined || !clientId || !attendeeId || !secret || !UUID.test(clientId) || !UUID.test(attendeeId)) throw notFound();
  return { clientId, attendeeId, secret };
}

export async function getManagedBooking(db: Db, agencyId: string, token: string) {
  const t = parseToken(token);
  return inClient(db, agencyId, t.clientId, async (tx) => {
    const { att, appt, cal } = await managed(tx, t.clientId, t.attendeeId, t.secret);
    return {
      calendar_name: cal.name,
      timezone: cal.timezone,
      starts_at: appt.startsAt.toISOString(),
      ends_at: appt.endsAt.toISOString(),
      name: att.attendee.name,
      status: att.status,
      can_cancel: att.status === "booked" && appt.status === "booked" && appt.startsAt.getTime() > Date.now(),
    };
  });
}

export async function cancelManagedBooking(db: Db, agencyId: string, token: string) {
  const t = parseToken(token);
  await inClient(db, agencyId, t.clientId, async (tx) => {
    const { att, appt } = await managed(tx, t.clientId, t.attendeeId, t.secret);
    if (att.status !== "booked" || appt.status !== "booked") throw new DomainError("conflict", "This booking is already cancelled.");
    if (appt.startsAt.getTime() <= Date.now()) throw new DomainError("conflict", "This appointment has already started.");
    await tx.update(appointmentAttendees).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(appointmentAttendees.id, att.id));
    const left = await tx.select({ id: appointmentAttendees.id }).from(appointmentAttendees).where(and(eq(appointmentAttendees.appointmentId, appt.id), eq(appointmentAttendees.status, "booked")));
    if (!left.length) await cancelAll(tx, appt);
  });
  return { ok: true };
}
