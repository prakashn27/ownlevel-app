import { sql } from "drizzle-orm";
import { boolean, customType, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { agencies, clients } from "./tenancy-schema.js";

/** Postgres tstzrange as its text form, e.g. `["2026-01-01 10:00+00","2026-01-01 10:30+00")`. Written with SQL, read as text. */
const tstzrange = customType<{ data: string }>({ dataType: () => "tstzrange" });

export type CalendarType = "personal" | "round_robin" | "class" | "collective";
export type WeeklyHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", [string, string][]>>;

/**
 * Calendars and appointments. See docs/Technical/5_1_Calendar.md.
 * All tables are client-scoped with the standard tenant policy (migration 0007), plus:
 * - appointment_hosts has an exclusion constraint so a host can never be double-booked
 * - a one-session-per-slot unique index for class calendars
 */
export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    type: text("type").$type<CalendarType>().notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    /** Offered to visitors' AI assistants (also needs the client's master switch and a published calendar). */
    aiBooking: boolean("ai_booking").notNull().default(false),
    timezone: text("timezone").notNull(),
    /** Phone default country for the booking page; null = the client's, then the agency's. */
    defaultCountry: text("default_country"),
    /** Fixed booking fields. Name is always required. With neither required, a booking must give a phone or an email. */
    requireEmail: boolean("require_email").notNull().default(false),
    requirePhone: boolean("require_phone").notNull().default(false),
    durationMin: integer("duration_min").notNull().default(30),
    slotIntervalMin: integer("slot_interval_min").notNull().default(30),
    capacity: integer("capacity"),
    bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
    bufferAfterMin: integer("buffer_after_min").notNull().default(0),
    minNoticeMin: integer("min_notice_min").notNull().default(60),
    maxDaysAhead: integer("max_days_ahead").notNull().default(60),
    weeklyHours: jsonb("weekly_hours").$type<WeeklyHours>().notNull(),
    bookingForm: jsonb("booking_form").$type<unknown[]>().notNull().default([]),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("calendars_client_slug").on(t.clientId, t.slug),
    unique("calendars_client_id_id").on(t.clientId, t.id),
    index("calendars_client_status").on(t.clientId, t.status),
  ],
);

export const calendarHosts = pgTable(
  "calendar_hosts",
  {
    calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    priority: integer("priority").notNull().default(0),
    lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.calendarId, t.userId] }), index("calendar_hosts_user").on(t.userId)],
);

export const calendarDateOverrides = pgTable(
  "calendar_date_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    intervals: jsonb("intervals").$type<[string, string][]>().notNull(),
  },
  (t) => [unique("calendar_date_overrides_calendar_date").on(t.calendarId, t.date)],
);

/** One row per meeting; for class calendars, one row per session. */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id").notNull().references(() => calendars.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("booked"),
    capacity: integer("capacity"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    unique("appointments_client_id_id").on(t.clientId, t.id),
    index("appointments_client_calendar_start").on(t.clientId, t.calendarId, t.startsAt),
    // One session per class slot. Not for other types: round robin may book two hosts at the same start.
    uniqueIndex("appointments_class_session").on(t.calendarId, t.startsAt).where(sql`${t.status} = 'booked' and ${t.capacity} is not null`),
  ],
);

/** Each host's busy time. The exclusion constraint (migration) is what prevents double booking. */
export const appointmentHosts = pgTable(
  "appointment_hosts",
  {
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    busy: tstzrange("busy").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.appointmentId, t.userId] }), index("appointment_hosts_user").on(t.userId)],
);

export type AttendeeInfo = { name: string; email?: string; phone?: string; timezone?: string };

/** People who booked. One per appointment, several for class sessions. */
export const appointmentAttendees = pgTable(
  "appointment_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull(),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("booked"),
    source: text("source").notNull(),
    attendee: jsonb("attendee").$type<AttendeeInfo>().notNull(),
    answers: jsonb("answers").$type<unknown[]>().notNull().default([]),
    contactId: uuid("contact_id"),
    manageTokenHash: text("manage_token_hash"),
    /** Makes a retried public booking return the first result instead of booking twice. */
    idempotencyKey: text("idempotency_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    index("appointment_attendees_appointment").on(t.appointmentId),
    index("appointment_attendees_client_contact").on(t.clientId, t.contactId),
    uniqueIndex("appointment_attendees_idempotency").on(t.clientId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
  ],
);
