/** Shapes returned by /api/clients/:clientId/calendars and /appointments. Names and notes are client data, not translated. */
export type CalendarType = "personal" | "round_robin" | "class" | "collective";
export type Host = { user_id: string; name: string; email: string; priority: number };
export type Calendar = {
  id: string;
  type: CalendarType;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  ai_booking: boolean;
  timezone: string;
  default_country: string | null;
  require_email: boolean;
  require_phone: boolean;
  booking_form: FormField[];
  duration_min: number;
  slot_interval_min: number;
  capacity: number | null;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  max_days_ahead: number;
  weekly_hours: Partial<Record<Day, [string, string][]>>;
  hosts: Host[];
  overrides?: { date: string; intervals: [string, string][] }[];
};
export type FieldType = "text" | "textarea" | "email" | "phone" | "number" | "select" | "multiselect" | "checkbox" | "date";
export type FormField = { key?: string; label: string; type: FieldType; required: boolean; placeholder?: string; options?: string[]; contactFieldKey?: string };

export type Attendee = { id: string; status: string; source: string; attendee: { name: string; email?: string; phone?: string } };
export type Appointment = {
  id: string;
  calendar_id: string;
  calendar_name: string | null;
  calendar_type: CalendarType | null;
  starts_at: string;
  ends_at: string;
  status: "booked" | "cancelled" | "completed";
  capacity: number | null;
  seats_taken: number;
  notes: string | null;
  hosts: { user_id: string; name: string }[];
  attendees: Attendee[];
};
export type Slot = { start: string; end: string; hostIds: string[]; seatsLeft?: number };

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const TYPES: CalendarType[] = ["personal", "round_robin", "class", "collective"];

export const base = (clientId: string) => `/api/clients/${clientId}`;

import { dayKeyOf } from "../../../../lib/dates";
export * from "../../../../lib/dates";

/** Appointments by the local day they start on. */
export function byDay(items: Appointment[], tz: string) {
  const m = new Map<string, Appointment[]>();
  for (const a of items) {
    const k = dayKeyOf(Date.parse(a.starts_at), tz);
    m.set(k, [...(m.get(k) ?? []), a]);
  }
  return m;
}
