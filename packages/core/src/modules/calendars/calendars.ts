import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  appointmentAttendees,
  appointments,
  calendarDateOverrides,
  calendarHosts,
  calendars,
  clients,
  memberships,
  user,
  withTenant,
  type CalendarType,
  type Db,
  type Tx,
  type WeeklyHours,
} from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { type CalendarScope, requireCalendars } from "./access.js";
import { isCountry } from "../crm/index.js";
import { parseBookingForm } from "./form.js";
import { computeSlots, localDate } from "./slots.js";
import { MIN, bad, hostBusy, instant, integer, text, timezone, uuid } from "./util.js";

const TYPES: CalendarType[] = ["personal", "round_robin", "class", "collective"];
const STATUSES = ["draft", "published", "archived"] as const;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const RESERVED = new Set(["api", "admin", "embed", "book", "new", "settings", "calendars", "manage"]);
const DEFAULT_HOURS: WeeklyHours = Object.fromEntries((["mon", "tue", "wed", "thu", "fri"] as const).map((d) => [d, [["09:00", "17:00"]]]));
const MAX_SLOT_WINDOW_DAYS = 31;

type CalendarRow = typeof calendars.$inferSelect;

/** Hosts a type needs: exactly one for personal and class, two or more for round robin and collective. */
const hostRule = (type: CalendarType) => (type === "personal" || type === "class" ? { min: 1, max: 1 } : { min: 2, max: Infinity });

// ── Validation ──
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A list of [open, close] local-time intervals: valid, in order, not overlapping. */
export function parseIntervals(v: unknown, label: string): [string, string][] {
  if (!Array.isArray(v) || v.length > 12) return bad(`${label} must be a list of up to 12 time ranges.`);
  let prev = "";
  return v.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || !HM.test(p[0]) || !HM.test(p[1])) return bad(`${label}: each range is ["HH:MM", "HH:MM"].`);
    if (p[0] >= p[1]) bad(`${label}: a range must end after it starts.`);
    if (p[0] < prev) bad(`${label}: ranges must be in order and not overlap.`);
    prev = p[1];
    return [p[0], p[1]] as [string, string];
  });
}

export function parseWeeklyHours(v: unknown): WeeklyHours {
  if (!v || typeof v !== "object" || Array.isArray(v)) return bad("weekly_hours must be an object keyed by mon to sun.");
  const out: WeeklyHours = {};
  for (const [k, val] of Object.entries(v)) {
    if (!(DAYS as readonly string[]).includes(k)) bad(`weekly_hours: unknown day "${k}".`);
    const iv = parseIntervals(val, `weekly_hours.${k}`);
    if (iv.length) out[k as (typeof DAYS)[number]] = iv;
  }
  return out;
}

export function parseSlug(v: unknown) {
  const s = text(v, 60, "Slug", true)!.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/.test(s)) bad("Slug must be 3 to 60 characters: lowercase letters, digits and hyphens.");
  if (RESERVED.has(s)) bad(`"${s}" is reserved. Choose another slug.`);
  return s;
}
export function parseCountry(v: unknown) {
  const c = text(v, 2, "Country")?.toUpperCase();
  if (c && !isCountry(c)) bad("Country must be a 2-letter country code like US.");
  return c;
}

/**
 * Name is always asked. Phone and email are each required or optional; when neither is required, a booking
 * must still give one of the two (so it can be matched to a contact). That "phone or email" rule is the default.
 */
function parseRequired(email: unknown, phone: unknown, curEmail: boolean, curPhone: boolean): [boolean, boolean] {
  for (const v of [email, phone]) if (v !== undefined && typeof v !== "boolean") bad("require_email and require_phone must be true or false.");
  return [(email as boolean | undefined) ?? curEmail, (phone as boolean | undefined) ?? curPhone];
}

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");

// ── Output ──
async function hostsOf(tx: Tx, calendarIds: string[]) {
  if (!calendarIds.length) return new Map<string, { userId: string; name: string; email: string; priority: number }[]>();
  const rows = await tx
    .select({ calendarId: calendarHosts.calendarId, userId: calendarHosts.userId, priority: calendarHosts.priority, name: user.name, email: user.email })
    .from(calendarHosts)
    .innerJoin(user, eq(user.id, calendarHosts.userId))
    .where(inArray(calendarHosts.calendarId, calendarIds))
    .orderBy(asc(user.name));
  const m = new Map<string, { userId: string; name: string; email: string; priority: number }[]>();
  for (const r of rows) m.set(r.calendarId, [...(m.get(r.calendarId) ?? []), { userId: r.userId, name: r.name, email: r.email, priority: r.priority }]);
  return m;
}

const shape = (c: CalendarRow, hosts: { userId: string; name: string; email: string; priority: number }[]) => ({
  id: c.id,
  type: c.type,
  name: c.name,
  slug: c.slug,
  description: c.description,
  status: c.status,
  timezone: c.timezone,
  default_country: c.defaultCountry,
  require_email: c.requireEmail,
  require_phone: c.requirePhone,
  duration_min: c.durationMin,
  slot_interval_min: c.slotIntervalMin,
  capacity: c.capacity,
  buffer_before_min: c.bufferBeforeMin,
  buffer_after_min: c.bufferAfterMin,
  min_notice_min: c.minNoticeMin,
  max_days_ahead: c.maxDaysAhead,
  weekly_hours: c.weeklyHours,
  booking_form: c.bookingForm,
  hosts: hosts.map((h) => ({ user_id: h.userId, name: h.name, email: h.email, priority: h.priority })),
  created_at: c.createdAt.toISOString(),
  updated_at: c.updatedAt.toISOString(),
});

export async function loadCalendar(tx: Tx, clientId: string, id: string) {
  uuid(id, "Calendar");
  const [row] = await tx.select().from(calendars).where(and(eq(calendars.id, id), eq(calendars.clientId, clientId)));
  if (!row) throw new DomainError("not_found", "Calendar not found.");
  return row;
}

const withHosts = async (tx: Tx, row: CalendarRow) => shape(row, (await hostsOf(tx, [row.id])).get(row.id) ?? []);

/** Hosts must be people who can reach this client: its own members, or agency staff. Checked in agency context, where memberships are visible. */
async function assertHostsEligible(db: Db, scope: CalendarScope, userIds: string[]) {
  if (!userIds.length) return;
  for (const u of userIds) if (typeof u !== "string" || !u) bad("host_ids must be a list of user ids.");
  const ok = await withTenant(db, { agencyId: scope.agencyId, userId: scope.userId }, (tx) =>
    tx
      .selectDistinct({ userId: memberships.userId })
      .from(memberships)
      .where(and(inArray(memberships.userId, userIds), eq(memberships.agencyId, scope.agencyId), sql`(${memberships.clientId} is null or ${memberships.clientId} = ${scope.clientId})`)),
  );
  const have = new Set(ok.map((r) => r.userId));
  const missing = userIds.filter((u) => !have.has(u));
  if (missing.length) throw new DomainError("invalid_input", "Every host must be a member of this client or of its agency.", { user_ids: missing });
}

/** People who can be hosts: this client's members and the agency's staff. */
export async function listEligibleHosts(db: Db, scope: CalendarScope) {
  await withTenant(db, scope, (tx) => requireCalendars(tx, scope, "configure"));
  const rows = await withTenant(db, { agencyId: scope.agencyId, userId: scope.userId }, (tx) =>
    tx
      .selectDistinct({ userId: user.id, name: user.name, email: user.email })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(and(eq(memberships.agencyId, scope.agencyId), sql`(${memberships.clientId} is null or ${memberships.clientId} = ${scope.clientId})`))
      .orderBy(asc(user.name)),
  );
  return { items: rows.map((r) => ({ user_id: r.userId, name: r.name, email: r.email })) };
}

// ── Calendars ──
export const listCalendars = (db: Db, scope: CalendarScope, opts: { status?: string } = {}) =>
  withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    const rows = await tx
      .select()
      .from(calendars)
      .where(and(eq(calendars.clientId, scope.clientId), opts.status ? eq(calendars.status, opts.status) : sql`${calendars.status} <> 'archived'`))
      .orderBy(asc(calendars.name));
    const hosts = await hostsOf(tx, rows.map((r) => r.id));
    return { items: rows.map((r) => shape(r, hosts.get(r.id) ?? [])) };
  });

export const getCalendar = (db: Db, scope: CalendarScope, id: string) =>
  withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    const row = await loadCalendar(tx, scope.clientId, id);
    const overrides = await tx.select().from(calendarDateOverrides).where(eq(calendarDateOverrides.calendarId, row.id)).orderBy(asc(calendarDateOverrides.date));
    return { ...(await withHosts(tx, row)), overrides: overrides.map((o) => ({ date: o.date, intervals: o.intervals })) };
  });

/** Creating a calendar fixes its type for good. */
export async function createCalendar(db: Db, scope: CalendarScope, input: Record<string, unknown>) {
  if (!TYPES.includes(input.type as CalendarType)) bad("type must be personal, round_robin, class or collective.");
  const type = input.type as CalendarType;
  const name = text(input.name, 120, "Name", true)!;
  const explicitSlug = input.slug === undefined ? undefined : parseSlug(input.slug);
  const tz = timezone(input.timezone);
  const country = parseCountry(input.default_country);
  const [requireEmail, requirePhone] = parseRequired(input.require_email, input.require_phone, false, false);
  const duration = integer(input.duration_min, 5, 480, "duration_min") ?? 30;
  const interval = integer(input.slot_interval_min, 5, 480, "slot_interval_min") ?? Math.min(duration, 30);
  const capacity = integer(input.capacity, 1, 1000, "capacity");
  if (type === "class" && capacity === undefined) bad("A class calendar needs a capacity.");
  if (type !== "class" && capacity !== undefined) bad("Only class calendars have a capacity.");
  const hostIds = input.host_ids === undefined ? [] : Array.isArray(input.host_ids) ? (input.host_ids as string[]) : bad("host_ids must be a list.");
  if (new Set(hostIds).size !== hostIds.length) bad("host_ids has duplicates.");
  if (hostIds.length > hostRule(type).max) bad(`A ${type.replace("_", " ")} calendar has exactly one host.`);
  const values = {
    description: text(input.description, 2000, "Description"),
    bufferBeforeMin: integer(input.buffer_before_min, 0, 240, "buffer_before_min") ?? 0,
    bufferAfterMin: integer(input.buffer_after_min, 0, 240, "buffer_after_min") ?? 0,
    minNoticeMin: integer(input.min_notice_min, 0, 43200, "min_notice_min") ?? 60,
    maxDaysAhead: integer(input.max_days_ahead, 1, 365, "max_days_ahead") ?? 60,
    weeklyHours: input.weekly_hours === undefined ? DEFAULT_HOURS : parseWeeklyHours(input.weekly_hours),
    bookingForm: input.booking_form === undefined ? [] : parseBookingForm(input.booking_form),
  };
  await assertHostsEligible(db, scope, hostIds);

  return withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "manage");
    const [client] = await tx.select({ timezone: clients.timezone }).from(clients).where(eq(clients.id, scope.clientId));
    const base = explicitSlug ?? (slugify(name).length >= 3 ? slugify(name) : "calendar");
    let slug = base;
    for (let n = 2; ; n++) {
      const [taken] = await tx.select({ id: calendars.id }).from(calendars).where(and(eq(calendars.clientId, scope.clientId), eq(calendars.slug, slug)));
      if (!taken) break;
      if (explicitSlug) throw new DomainError("slug_taken", "That slug is already used by another calendar.");
      slug = `${base}-${n}`;
    }
    const [row] = await tx
      .insert(calendars)
      .values({ agencyId: scope.agencyId, clientId: scope.clientId, type, name, slug, timezone: tz ?? client!.timezone, defaultCountry: country ?? null, requireEmail, requirePhone, durationMin: duration, slotIntervalMin: interval, capacity: capacity ?? null, createdBy: scope.userId, ...values })
      .returning();
    if (hostIds.length) await tx.insert(calendarHosts).values(hostIds.map((userId) => ({ calendarId: row!.id, userId, agencyId: scope.agencyId, clientId: scope.clientId })));
    return withHosts(tx, row!);
  });
}

/** Partial update. Status changes need manage rights; everything else needs configure rights. The type never changes. */
export async function updateCalendar(db: Db, scope: CalendarScope, id: string, input: Record<string, unknown>) {
  const patch: Partial<typeof calendars.$inferInsert> = {};
  if (input.type !== undefined) bad("A calendar's type can't be changed. Create a new calendar instead.");
  if (input.name !== undefined) patch.name = text(input.name, 120, "Name", true);
  if (input.slug !== undefined) patch.slug = parseSlug(input.slug);
  if (input.description !== undefined) patch.description = input.description === null ? null : (text(input.description, 2000, "Description") ?? null);
  const tz = timezone(input.timezone);
  if (tz) patch.timezone = tz;
  if (input.default_country !== undefined) patch.defaultCountry = input.default_country === null ? null : (parseCountry(input.default_country) ?? null);
  const wantsRequired = input.require_email !== undefined || input.require_phone !== undefined;
  const num: [string, keyof typeof patch, number, number][] = [
    ["duration_min", "durationMin", 5, 480], ["slot_interval_min", "slotIntervalMin", 5, 480], ["capacity", "capacity", 1, 1000],
    ["buffer_before_min", "bufferBeforeMin", 0, 240], ["buffer_after_min", "bufferAfterMin", 0, 240],
    ["min_notice_min", "minNoticeMin", 0, 43200], ["max_days_ahead", "maxDaysAhead", 1, 365],
  ];
  for (const [k, col, lo, hi] of num) { const v = integer(input[k], lo, hi, k); if (v !== undefined) (patch as Record<string, unknown>)[col] = v; }
  if (input.weekly_hours !== undefined) patch.weeklyHours = parseWeeklyHours(input.weekly_hours);
  if (input.booking_form !== undefined) patch.bookingForm = parseBookingForm(input.booking_form);
  if (input.status !== undefined) {
    if (!(STATUSES as readonly unknown[]).includes(input.status)) bad("status must be draft, published or archived.");
    patch.status = input.status as string;
  }
  if (!Object.keys(patch).length && !wantsRequired) bad("Nothing to update.");

  return withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, input.status !== undefined ? "manage" : "configure");
    const row = await loadCalendar(tx, scope.clientId, id);
    if (patch.capacity !== undefined && row.type !== "class") bad("Only class calendars have a capacity.");
    if (wantsRequired) [patch.requireEmail, patch.requirePhone] = parseRequired(input.require_email, input.require_phone, row.requireEmail, row.requirePhone);
    if (patch.status === "published") {
      const count = (await hostsOf(tx, [row.id])).get(row.id)?.length ?? 0;
      if (count < hostRule(row.type).min) bad(`Add ${hostRule(row.type).min === 1 ? "a host" : "at least two hosts"} before publishing.`);
    }
    try {
      const [updated] = await tx.update(calendars).set({ ...patch, updatedAt: new Date() }).where(eq(calendars.id, row.id)).returning();
      return await withHosts(tx, updated!);
    } catch (e) {
      if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new DomainError("slug_taken", "That slug is already used by another calendar.");
      throw e;
    }
  });
}

/** Archive: hides the calendar and its page; appointments are kept. */
export const archiveCalendar = (db: Db, scope: CalendarScope, id: string) => updateCalendar(db, scope, id, { status: "archived" });

// ── Hosts ──
export async function addHost(db: Db, scope: CalendarScope, calendarId: string, userId: string, input: Record<string, unknown> = {}) {
  const priority = integer(input.priority, 0, 100, "priority") ?? 0;
  await assertHostsEligible(db, scope, [userId]);
  return withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "configure");
    const row = await loadCalendar(tx, scope.clientId, calendarId);
    const current = (await hostsOf(tx, [row.id])).get(row.id) ?? [];
    const existing = current.find((h) => h.userId === userId);
    if (!existing && current.length >= hostRule(row.type).max) throw new DomainError("conflict", `A ${row.type.replace("_", " ")} calendar has exactly one host. Remove the current host first.`);
    await tx
      .insert(calendarHosts)
      .values({ calendarId: row.id, userId, agencyId: scope.agencyId, clientId: scope.clientId, priority })
      .onConflictDoUpdate({ target: [calendarHosts.calendarId, calendarHosts.userId], set: { priority } });
    return withHosts(tx, row);
  });
}

/** Removing a host keeps their past appointments. A published calendar must keep enough hosts. */
export const removeHost = (db: Db, scope: CalendarScope, calendarId: string, userId: string) =>
  withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "configure");
    const row = await loadCalendar(tx, scope.clientId, calendarId);
    const current = (await hostsOf(tx, [row.id])).get(row.id) ?? [];
    if (!current.some((h) => h.userId === userId)) throw new DomainError("not_found", "Host not found.");
    if (row.status === "published" && current.length - 1 < hostRule(row.type).min) throw new DomainError("conflict", "A published calendar needs its hosts. Unpublish it first.");
    await tx.delete(calendarHosts).where(and(eq(calendarHosts.calendarId, row.id), eq(calendarHosts.userId, userId)));
    return withHosts(tx, row);
  });

// ── Date overrides ──
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

/** One day's hours, replacing the weekly ones. `[]` closes the day. */
export async function setOverride(db: Db, scope: CalendarScope, calendarId: string, date: string, input: Record<string, unknown>) {
  if (!validDate(date)) bad("date must be YYYY-MM-DD.");
  const intervals = parseIntervals(input.intervals, "intervals");
  return withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "configure");
    const row = await loadCalendar(tx, scope.clientId, calendarId);
    await tx
      .insert(calendarDateOverrides)
      .values({ agencyId: scope.agencyId, clientId: scope.clientId, calendarId: row.id, date, intervals })
      .onConflictDoUpdate({ target: [calendarDateOverrides.calendarId, calendarDateOverrides.date], set: { intervals } });
    return { date, intervals };
  });
}

export const clearOverride = (db: Db, scope: CalendarScope, calendarId: string, date: string) =>
  withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "configure");
    const row = await loadCalendar(tx, scope.clientId, calendarId);
    if (!validDate(date)) bad("date must be YYYY-MM-DD.");
    await tx.delete(calendarDateOverrides).where(and(eq(calendarDateOverrides.calendarId, row.id), eq(calendarDateOverrides.date, date)));
    return { ok: true };
  });

// ── Free slots ──
/** Loads what computeSlots needs. Used by the slots route and by round-robin booking. */
export async function slotsFor(tx: Tx, cal: CalendarRow, from: number, to: number, now = Date.now()) {
  const hostRows = (await tx.select({ userId: calendarHosts.userId, priority: calendarHosts.priority, lastAssignedAt: calendarHosts.lastAssignedAt }).from(calendarHosts).where(eq(calendarHosts.calendarId, cal.id)));
  const hosts = hostRows.map((h) => ({ userId: h.userId, priority: h.priority, lastAssignedAt: h.lastAssignedAt?.getTime() ?? null }));
  const overrideRows = await tx
    .select()
    .from(calendarDateOverrides)
    .where(and(eq(calendarDateOverrides.calendarId, cal.id), sql`${calendarDateOverrides.date} between ${localDate(from - 86_400_000, cal.timezone)} and ${localDate(to + 86_400_000, cal.timezone)}`));
  const busy = await hostBusy(tx, hosts.map((h) => h.userId), from - 24 * 60 * MIN, to + 24 * 60 * MIN);
  let sessions: { start: number; seatsTaken: number }[] | undefined;
  if (cal.type === "class") {
    const rows = await tx
      .select({ id: appointments.id, startsAt: appointments.startsAt })
      .from(appointments)
      .where(and(eq(appointments.calendarId, cal.id), eq(appointments.status, "booked"), gte(appointments.startsAt, new Date(from)), lt(appointments.startsAt, new Date(to))));
    const counts = rows.length
      ? await tx
          .select({ appointmentId: appointmentAttendees.appointmentId, n: sql<number>`count(*)::int` })
          .from(appointmentAttendees)
          .where(and(inArray(appointmentAttendees.appointmentId, rows.map((r) => r.id)), eq(appointmentAttendees.status, "booked")))
          .groupBy(appointmentAttendees.appointmentId)
      : [];
    const n = new Map(counts.map((c) => [c.appointmentId, c.n]));
    sessions = rows.map((r) => ({ start: r.startsAt.getTime(), seatsTaken: n.get(r.id) ?? 0 }));
  }
  return computeSlots({
    type: cal.type,
    capacity: cal.capacity,
    weeklyHours: cal.weeklyHours,
    overrides: Object.fromEntries(overrideRows.map((o) => [o.date, o.intervals])),
    timezone: cal.timezone,
    durationMin: cal.durationMin,
    slotIntervalMin: cal.slotIntervalMin,
    bufferBeforeMin: cal.bufferBeforeMin,
    bufferAfterMin: cal.bufferAfterMin,
    minNoticeMin: cal.minNoticeMin,
    maxDaysAhead: cal.maxDaysAhead,
    hosts,
    hostBusy: busy,
    sessions,
    from,
    to,
    now,
  });
}

export async function getSlots(db: Db, scope: CalendarScope, calendarId: string, q: { from?: string; to?: string }) {
  const from = instant(q.from, "from");
  const to = instant(q.to, "to");
  if (to <= from) bad("to must be after from.");
  if (to - from > MAX_SLOT_WINDOW_DAYS * 86_400_000) bad(`The window can be at most ${MAX_SLOT_WINDOW_DAYS} days.`);
  return withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    const cal = await loadCalendar(tx, scope.clientId, calendarId);
    return { timezone: cal.timezone, slots: await slotsFor(tx, cal, from, to) };
  });
}

