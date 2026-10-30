import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, exists, gt, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import {
  appointmentAttendees,
  appointmentHosts,
  appointments,
  calendarHosts,
  calendars,
  user,
  withTenant,
  type AttendeeInfo,
  type Db,
  type Tx,
} from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { assertCanTouch, requireCalendars, type CalendarScope } from "./access.js";
import { pickRoundRobin } from "./assign.js";
import { loadCalendar, slotsFor } from "./calendars.js";
import { MIN, bad, hostBusy, instant, iso, pgCode, text, uuid } from "./util.js";
import { defaultCountry, linkContact, normalizePhone } from "./contacts.js";

const MAX_RANGE_DAYS = 62;
/** Upcoming bookings one email or phone may hold with a client when booking through AI assistants. */
export const MAX_UPCOMING_PER_PERSON_AI = 3;
const STATUSES = ["booked", "cancelled", "completed"];
const ATTENDEE_STATUSES = ["cancelled", "no_show", "attended"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const taken = () => new DomainError("conflict", "That time is no longer available.", { reason: "slot_taken" });

// ── Output ──
async function shapeAll(tx: Tx, rows: (typeof appointments.$inferSelect)[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const cals = await tx.select({ id: calendars.id, name: calendars.name, type: calendars.type }).from(calendars).where(inArray(calendars.id, [...new Set(rows.map((r) => r.calendarId))]));
  const hosts = await tx
    .select({ appointmentId: appointmentHosts.appointmentId, userId: appointmentHosts.userId, name: user.name })
    .from(appointmentHosts)
    .innerJoin(user, eq(user.id, appointmentHosts.userId))
    .where(inArray(appointmentHosts.appointmentId, ids))
    .orderBy(asc(user.name));
  const attendees = await tx.select().from(appointmentAttendees).where(inArray(appointmentAttendees.appointmentId, ids)).orderBy(asc(appointmentAttendees.createdAt));
  return rows.map((r) => {
    const cal = cals.find((c) => c.id === r.calendarId);
    const list = attendees.filter((a) => a.appointmentId === r.id);
    return {
      id: r.id,
      calendar_id: r.calendarId,
      calendar_name: cal?.name ?? null,
      calendar_type: cal?.type ?? null,
      starts_at: iso(r.startsAt),
      ends_at: iso(r.endsAt),
      status: r.status,
      capacity: r.capacity,
      seats_taken: list.filter((a) => a.status === "booked").length,
      notes: r.notes,
      created_by: r.createdBy,
      hosts: hosts.filter((h) => h.appointmentId === r.id).map((h) => ({ user_id: h.userId, name: h.name })),
      attendees: list.map((a) => ({ id: a.id, status: a.status, source: a.source, attendee: a.attendee, contact_id: a.contactId })),
    };
  });
}

async function loadAppointment(tx: Tx, clientId: string, id: string) {
  uuid(id, "Appointment");
  const [row] = await tx.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.clientId, clientId)));
  if (!row) throw new DomainError("not_found", "Appointment not found.");
  return row;
}

async function hostIdsOf(tx: Tx, appointmentId: string) {
  return (await tx.select({ userId: appointmentHosts.userId }).from(appointmentHosts).where(eq(appointmentHosts.appointmentId, appointmentId))).map((h) => h.userId);
}

// ── Reading ──
export type AppointmentQuery = { from?: string; to?: string; calendarId?: string; hostId?: string; status?: string; cursor?: string; limit?: number };

/** Appointments overlapping [from, to), oldest first. Month, week and list views are all this query. */
export async function listAppointments(db: Db, scope: CalendarScope, q: AppointmentQuery) {
  const from = instant(q.from, "from");
  const to = instant(q.to, "to");
  if (to <= from) bad("to must be after from.");
  if (to - from > MAX_RANGE_DAYS * 86_400_000) bad(`The range can be at most ${MAX_RANGE_DAYS} days.`);
  const limit = Math.min(Math.max(q.limit ?? 200, 1), 500);
  const statuses = q.status ? q.status.split(",") : [];
  if (statuses.some((s) => !STATUSES.includes(s))) bad("status must be booked, cancelled or completed.");
  let after: { at: Date; id: string } | undefined;
  if (q.cursor) {
    const [at, id] = Buffer.from(q.cursor, "base64url").toString().split("|");
    if (!at || !id || !Number.isFinite(Date.parse(at))) bad("Invalid cursor.");
    after = { at: new Date(at!), id: id! };
  }
  return withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    const where: (SQL | undefined)[] = [
      eq(appointments.clientId, scope.clientId),
      lt(appointments.startsAt, new Date(to)),
      gt(appointments.endsAt, new Date(from)),
      q.calendarId ? eq(appointments.calendarId, uuid(q.calendarId, "Calendar")) : undefined,
      statuses.length ? inArray(appointments.status, statuses) : undefined,
      q.hostId ? exists(tx.select({ x: sql`1` }).from(appointmentHosts).where(and(eq(appointmentHosts.appointmentId, appointments.id), eq(appointmentHosts.userId, q.hostId)))) : undefined,
      after ? or(gt(appointments.startsAt, after.at), and(eq(appointments.startsAt, after.at), gt(appointments.id, after.id))) : undefined,
    ];
    const rows = await tx.select().from(appointments).where(and(...where)).orderBy(asc(appointments.startsAt), asc(appointments.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await shapeAll(tx, page),
      next_cursor: rows.length > limit && last ? Buffer.from(`${last.startsAt.toISOString()}|${last.id}`).toString("base64url") : null,
    };
  });
}

export const getAppointment = (db: Db, scope: CalendarScope, id: string) =>
  withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    return (await shapeAll(tx, [await loadAppointment(tx, scope.clientId, id)]))[0]!;
  });

/** A contact's appointments across all of the client's calendars, newest first: the unified view on the contact record. */
export async function listContactAppointments(db: Db, scope: CalendarScope, contactId: string) {
  uuid(contactId, "Contact");
  return withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    const rows = await tx
      .selectDistinct({ a: appointments })
      .from(appointments)
      .innerJoin(appointmentAttendees, eq(appointmentAttendees.appointmentId, appointments.id))
      .where(and(eq(appointments.clientId, scope.clientId), eq(appointmentAttendees.contactId, contactId)));
    const list = rows.map((r) => r.a).sort((x, y) => y.startsAt.getTime() - x.startsAt.getTime()).slice(0, 200);
    const shaped = await shapeAll(tx, list);
    // Only this contact's own booking: other attendees of a class session are not theirs to see here.
    return { items: shaped.map((a) => ({ ...a, attendees: a.attendees.filter((x) => x.contact_id === contactId) })) };
  });
}

// ── Creating ──
function parseAttendee(v: unknown): AttendeeInfo {
  if (!v || typeof v !== "object") return bad("attendee is required.");
  const a = v as Record<string, unknown>;
  const name = text(a.name, 120, "Attendee name", true)!;
  const email = text(a.email, 254, "Attendee email")?.toLowerCase();
  if (email && !EMAIL.test(email)) bad("Attendee email is not valid.");
  const phone = text(a.phone, 40, "Attendee phone");
  if (!email && !phone) bad("Give the attendee an email or a phone number.");
  return { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
}

export type BookInput = {
  calendarId: string;
  start: number;
  hostId?: string;
  attendee: { name: string; email?: string; phone?: string; timezone?: string };
  /** Country the visitor picked next to the phone field; otherwise the default country applies. */
  phoneCountry?: string;
  notes?: string;
  /** Booking form answers as stored: [{key, label, type, value}]. */
  answers?: unknown[];
  /** Answers saved to contact fields, by contact field key. */
  mapped?: Record<string, unknown>;
  /** `mcp` = an AI assistant booking for a visitor through the public MCP endpoint; handled like `public`. */
  source: "staff" | "public" | "mcp";
  userId: string | null;
  /** Public bookings: the calendar's required fixed fields, and an Idempotency-Key. */
  idempotencyKey?: string;
};

export type Booked = { appointment: Awaited<ReturnType<typeof shapeAll>>[number]; attendeeId: string; token?: string; replayed?: boolean };

/** The signed secret handed to a public attendee: `{clientId}.{attendeeId}.{secret}`. Only the hash of the secret is stored. */
const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Staff booking, for any calendar type (outside working hours is fine; a host can never be double-booked):
 * - personal, class: the calendar's host; class sessions are joined while seats are left
 * - round robin: the free host assigned longest ago, or `host_id` if given
 * - collective: every host
 */
export async function createAppointment(db: Db, scope: CalendarScope, input: Record<string, unknown>) {
  const attendee = parseAttendee(input.attendee);
  const p: BookInput = {
    calendarId: uuid(typeof input.calendar_id === "string" ? input.calendar_id : "", "Calendar"),
    start: instant(input.starts_at, "starts_at"),
    hostId: text(input.host_id, 100, "host_id"),
    attendee,
    notes: text(input.notes, 2000, "Notes"),
    source: "staff",
    userId: scope.userId,
  };
  const booked = await withRetry(() =>
    withTenant(db, scope, async (tx) => {
      await requireCalendars(tx, scope, "own");
      return book(tx, scope, await loadCalendar(tx, scope.clientId, p.calendarId), p);
    }),
  );
  return booked.appointment;
}

/**
 * A booking racing for the same class session can lose the unique index; one retry joins the session.
 * A lost exclusion constraint means the host was taken: 409 slot_taken.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = pgCode(e);
      if (code === "23P01") throw taken();
      if (code === "23505" && attempt === 0) continue;
      if (code === "23505") throw taken();
      throw e;
    }
  }
}

/** Books inside the caller's transaction and tenant context. Public callers have no user; permissions were checked by the caller. */
export async function book(tx: Tx, scope: { agencyId: string; clientId: string }, cal: Awaited<ReturnType<typeof loadCalendar>>, p: BookInput): Promise<Booked> {
  const pub = p.source !== "staff";
  if (pub && p.idempotencyKey) {
    const [prior] = await tx.select().from(appointmentAttendees).where(and(eq(appointmentAttendees.clientId, scope.clientId), eq(appointmentAttendees.idempotencyKey, p.idempotencyKey)));
    if (prior) {
      const [appt] = await tx.select().from(appointments).where(eq(appointments.id, prior.appointmentId));
      return { appointment: (await shapeAll(tx, [appt!]))[0]!, attendeeId: prior.id, replayed: true };
    }
  }
  if (cal.status === "archived" || (pub && cal.status !== "published")) throw new DomainError("conflict", "This calendar is not taking bookings.");
  const hosts = await tx.select({ userId: calendarHosts.userId, priority: calendarHosts.priority, lastAssignedAt: calendarHosts.lastAssignedAt }).from(calendarHosts).where(eq(calendarHosts.calendarId, cal.id));
  if (!hosts.length) throw new DomainError("conflict", "This calendar has no hosts yet.");

  const start = new Date(p.start);
  const end = new Date(p.start + cal.durationMin * MIN);
  const busyFrom = new Date(p.start - cal.bufferBeforeMin * MIN);
  const busyTo = new Date(end.getTime() + cal.bufferAfterMin * MIN);

  // Public visitors may only take a slot the engine offers (working hours, notice, horizon, free hosts, seats).
  let offered: string[] | undefined;
  if (pub) {
    const slot = (await slotsFor(tx, cal, p.start, p.start + 1)).find((s) => Date.parse(s.start) === p.start);
    if (!slot) throw taken();
    offered = slot.hostIds;
  }

  // Phone to E.164, and the contact this booking belongs to.
  const country = p.phoneCountry ?? (await defaultCountry(tx, scope.clientId, cal.defaultCountry));
  const phone = p.attendee.phone ? normalizePhone(p.attendee.phone, country) : undefined;
  const attendeeInfo: AttendeeInfo = { name: p.attendee.name, ...(p.attendee.email ? { email: p.attendee.email } : {}), ...(phone ? { phone: phone.e164 } : {}), ...(p.attendee.timezone ? { timezone: p.attendee.timezone } : {}) };

  // An AI assistant can't solve a captcha, so one person can only hold a few upcoming bookings per client.
  if (p.source === "mcp") {
    const who = [
      attendeeInfo.email ? sql`${appointmentAttendees.attendee}->>'email' = ${attendeeInfo.email}` : undefined,
      attendeeInfo.phone ? sql`${appointmentAttendees.attendee}->>'phone' = ${attendeeInfo.phone}` : undefined,
    ].filter((x) => x !== undefined);
    const [held] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(appointmentAttendees)
      .innerJoin(appointments, eq(appointments.id, appointmentAttendees.appointmentId))
      .where(and(eq(appointmentAttendees.clientId, scope.clientId), eq(appointmentAttendees.status, "booked"), gt(appointments.startsAt, new Date()), sql`(${sql.join(who, sql` or `)})`));
    if (held!.n >= MAX_UPCOMING_PER_PERSON_AI) throw new DomainError("rate_limited", `This person already has ${MAX_UPCOMING_PER_PERSON_AI} upcoming bookings. Cancel one before booking another.`);
  }

  const attendeeId = randomUUID();
  const secret = pub ? randomBytes(24).toString("base64url") : undefined;
  const row = {
    id: attendeeId,
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    status: "booked",
    source: p.source,
    attendee: attendeeInfo,
    answers: p.answers ?? [],
    manageTokenHash: secret ? hashSecret(secret) : null,
    idempotencyKey: p.idempotencyKey ?? null,
    createdBy: p.userId,
  };
  const link = async () => {
    const actor = p.userId ? (await tx.select({ name: user.name }).from(user).where(eq(user.id, p.userId))).at(0) : undefined;
    const l = await linkContact(tx, scope, { name: attendeeInfo.name, email: attendeeInfo.email, phone, mapped: p.mapped, source: p.source === "mcp" ? "mcp" : pub ? "booking" : "staff", actor: { userId: p.userId, name: actor?.name ?? null } });
    await tx.update(appointmentAttendees).set({ contactId: l.contactId }).where(eq(appointmentAttendees.id, attendeeId));
  };
  const done = async (appt: typeof appointments.$inferSelect): Promise<Booked> => {
    await link();
    return { appointment: (await shapeAll(tx, [appt]))[0]!, attendeeId, ...(secret ? { token: `${scope.clientId}.${attendeeId}.${secret}` } : {}) };
  };

  // Class: join the session at this start if there is one.
  if (cal.type === "class") {
    const [session] = await tx
      .select()
      .from(appointments)
      .where(and(eq(appointments.calendarId, cal.id), eq(appointments.startsAt, start), eq(appointments.status, "booked")))
      .for("update");
    if (session) {
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(appointmentAttendees).where(and(eq(appointmentAttendees.appointmentId, session.id), eq(appointmentAttendees.status, "booked")));
      if (count!.n >= cal.capacity!) throw new DomainError("conflict", "This session is full.", { reason: "full" });
      await tx.insert(appointmentAttendees).values({ ...row, appointmentId: session.id });
      return done(session);
    }
  }

  let hostIds: string[];
  if (cal.type === "collective") hostIds = hosts.map((h) => h.userId);
  else if (cal.type === "round_robin") {
    if (p.hostId) {
      if (!hosts.some((h) => h.userId === p.hostId)) bad("host_id is not a host of this calendar.");
      hostIds = [p.hostId!];
    } else {
      let free = hosts.map((h) => h.userId);
      if (offered) free = free.filter((u) => offered!.includes(u));
      else {
        const busy = await hostBusy(tx, free, busyFrom.getTime(), busyTo.getTime());
        free = free.filter((u) => !busy[u]?.some((r) => r.start < busyTo.getTime() && busyFrom.getTime() < r.end));
      }
      const pick = pickRoundRobin(hosts.filter((h) => free.includes(h.userId)).map((h) => ({ userId: h.userId, priority: h.priority, lastAssignedAt: h.lastAssignedAt?.getTime() ?? null })));
      if (!pick) throw taken();
      hostIds = [pick.userId];
    }
  } else hostIds = [hosts[0]!.userId];

  const [appt] = await tx
    .insert(appointments)
    .values({ agencyId: scope.agencyId, clientId: scope.clientId, calendarId: cal.id, startsAt: start, endsAt: end, capacity: cal.type === "class" ? cal.capacity : null, notes: p.notes ?? null, createdBy: p.userId })
    .returning();
  for (const userId of hostIds)
    await tx.execute(sql`insert into appointment_hosts (appointment_id, user_id, agency_id, client_id, busy)
      values (${appt!.id}, ${userId}, ${scope.agencyId}, ${scope.clientId}, tstzrange(${busyFrom.toISOString()}::timestamptz, ${busyTo.toISOString()}::timestamptz, '[)'))`);
  if (cal.type === "round_robin") await tx.update(calendarHosts).set({ lastAssignedAt: new Date() }).where(and(eq(calendarHosts.calendarId, cal.id), eq(calendarHosts.userId, hostIds[0]!)));
  await tx.insert(appointmentAttendees).values({ ...row, appointmentId: appt!.id });
  return done(appt!);
}

// ── Changing ──
/** Frees the hosts and cancels everyone still booked. */
export async function cancelAll(tx: Tx, appt: typeof appointments.$inferSelect) {
  const now = new Date();
  await tx.update(appointments).set({ status: "cancelled", cancelledAt: now }).where(eq(appointments.id, appt.id));
  await tx.update(appointmentHosts).set({ active: false }).where(eq(appointmentHosts.appointmentId, appt.id));
  await tx.update(appointmentAttendees).set({ status: "cancelled", cancelledAt: now }).where(and(eq(appointmentAttendees.appointmentId, appt.id), eq(appointmentAttendees.status, "booked")));
}

async function guard(tx: Tx, scope: CalendarScope, id: string) {
  const roles = await requireCalendars(tx, scope, "own");
  const appt = await loadAppointment(tx, scope.clientId, id);
  assertCanTouch(roles, scope.userId, { createdBy: appt.createdBy, hostIds: await hostIdsOf(tx, appt.id) });
  return appt;
}

/** Cancel, mark completed, reschedule (`starts_at`, same length) or edit notes. A cancelled appointment is final: book a new one. */
export async function updateAppointment(db: Db, scope: CalendarScope, id: string, input: Record<string, unknown>) {
  const status = input.status;
  if (status !== undefined && status !== "cancelled" && status !== "completed") bad("status can be changed to cancelled or completed.");
  const start = input.starts_at === undefined ? undefined : instant(input.starts_at, "starts_at");
  const notes = input.notes === undefined ? undefined : input.notes === null ? null : (text(input.notes, 2000, "Notes") ?? null);
  if (status === undefined && start === undefined && notes === undefined) bad("Nothing to update.");
  if (status && start !== undefined) bad("Reschedule and change the status in separate requests.");
  try {
    return await withTenant(db, scope, async (tx) => {
      const appt = await guard(tx, scope, id);
      if (appt.status !== "booked" && (status !== undefined || start !== undefined)) throw new DomainError("conflict", `A ${appt.status} appointment can't be changed. Book a new one.`);
      if (notes !== undefined) await tx.update(appointments).set({ notes }).where(eq(appointments.id, appt.id));
      if (status === "cancelled") await cancelAll(tx, appt);
      else if (status === "completed") await tx.update(appointments).set({ status: "completed" }).where(eq(appointments.id, appt.id));
      else if (start !== undefined) {
        const cal = await loadCalendar(tx, scope.clientId, appt.calendarId);
        const len = appt.endsAt.getTime() - appt.startsAt.getTime();
        const s = new Date(start), e = new Date(start + len);
        await tx.update(appointments).set({ startsAt: s, endsAt: e }).where(eq(appointments.id, appt.id));
        await tx.execute(sql`update appointment_hosts set busy = tstzrange(${new Date(start - cal.bufferBeforeMin * MIN).toISOString()}::timestamptz, ${new Date(e.getTime() + cal.bufferAfterMin * MIN).toISOString()}::timestamptz, '[)')
          where appointment_id = ${appt.id}`);
      }
      return (await shapeAll(tx, [await loadAppointment(tx, scope.clientId, id)]))[0]!;
    });
  } catch (e) {
    if (pgCode(e) === "23P01" || pgCode(e) === "23505") throw taken();
    throw e;
  }
}

/** One attendee: cancel, no-show or attended. When no one is left booked, the appointment is cancelled and its hosts are freed. */
export async function updateAttendee(db: Db, scope: CalendarScope, appointmentId: string, attendeeId: string, input: Record<string, unknown>) {
  if (!ATTENDEE_STATUSES.includes(input.status as string)) bad("status must be cancelled, no_show or attended.");
  const status = input.status as string;
  uuid(attendeeId, "Attendee");
  return withTenant(db, scope, async (tx) => {
    const appt = await guard(tx, scope, appointmentId);
    const [a] = await tx.select().from(appointmentAttendees).where(and(eq(appointmentAttendees.id, attendeeId), eq(appointmentAttendees.appointmentId, appt.id)));
    if (!a) throw new DomainError("not_found", "Attendee not found.");
    if (a.status === "cancelled") throw new DomainError("conflict", "This booking is already cancelled.");
    await tx.update(appointmentAttendees).set({ status, cancelledAt: status === "cancelled" ? new Date() : null }).where(eq(appointmentAttendees.id, a.id));
    if (status === "cancelled" && appt.status === "booked") {
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(appointmentAttendees).where(and(eq(appointmentAttendees.appointmentId, appt.id), eq(appointmentAttendees.status, "booked")));
      if (count!.n === 0) await cancelAll(tx, appt);
    }
    return (await shapeAll(tx, [await loadAppointment(tx, scope.clientId, appt.id)]))[0]!;
  });
}

