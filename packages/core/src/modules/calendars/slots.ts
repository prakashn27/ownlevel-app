import type { CalendarType, WeeklyHours } from "../../db/calendars-schema.js";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `tz` from UTC at the instant `ms`, in ms. */
function offsetAt(ms: number, tz: string) {
  const p = parts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant at which the wall clock in `tz` reads y-m-d h:m. Times skipped by a clock change move forward. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const t = guess - offsetAt(guess, tz);
  return guess - offsetAt(t, tz);
}

/** Local calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function localDate(ms: number, tz: string) {
  const p = parts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** [from, to) instants covering `days` local days from `date` (YYYY-MM-DD) in `tz`. */
export function localDaysRange(date: string, days: number, tz: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { from: zonedToUtc(y, m, d, 0, 0, tz), to: zonedToUtc(y, m, d + days, 0, 0, tz) };
}

/** Wall-clock "YYYY-MM-DD HH:mm" of an instant in `tz`. */
export function localDateTime(ms: number, tz: string) {
  const p = parts(ms, tz);
  return `${localDate(ms, tz)} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export type Range = { start: number; end: number };
export type SlotHost = { userId: string; priority?: number; lastAssignedAt?: number | null };
export type Slot = { start: string; end: string; hostIds: string[]; seatsLeft?: number };

export type SlotInput = {
  type: CalendarType;
  capacity?: number | null;
  weeklyHours: WeeklyHours;
  /** Local date → intervals; an empty list closes the day. */
  overrides?: Record<string, [string, string][]>;
  timezone: string;
  durationMin: number;
  slotIntervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  hosts: SlotHost[];
  /** Busy ranges (already buffered) per host, epoch ms. */
  hostBusy: Record<string, Range[]>;
  /** Class calendars: existing sessions by start (epoch ms) with seats taken. */
  sessions?: { start: number; seatsTaken: number }[];
  from: number;
  to: number;
  now: number;
};

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return [h!, m!] as const;
};
const overlaps = (ranges: Range[] | undefined, a: number, b: number) => !!ranges?.some((r) => r.start < b && a < r.end);

/**
 * Free slots in [from, to), by calendar type:
 * - personal: the host is free
 * - round_robin: at least one host is free (all free hosts are returned)
 * - collective: every host is free
 * - class: a session at this start has seats left, or the host is free to start one
 * Pure: no database, so every type and clock-change edge is unit-testable.
 */
export function computeSlots(i: SlotInput): Slot[] {
  const out: Slot[] = [];
  if (!i.hosts.length) return out;
  const earliest = Math.max(i.from, i.now + i.minNoticeMin * MIN);
  const latest = Math.min(i.to, i.now + i.maxDaysAhead * DAY);
  if (earliest >= latest) return out;
  const sessions = new Map((i.sessions ?? []).map((s) => [s.start, s.seatsTaken]));
  const dur = i.durationMin * MIN;
  const step = i.slotIntervalMin * MIN;

  // Walk local dates from a day before the window to a day after, so slots near midnight in any zone are found.
  const first = localDate(earliest - DAY, i.timezone).split("-").map(Number) as [number, number, number];
  const days = Math.ceil((latest - earliest) / DAY) + 3;
  const seen = new Set<number>();
  for (let n = 0; n < days; n++) {
    const base = Date.UTC(first[0], first[1] - 1, first[2] + n);
    const dt = new Date(base);
    const date = dt.toISOString().slice(0, 10);
    const intervals = i.overrides?.[date] ?? i.weeklyHours[DAYS[dt.getUTCDay()]!] ?? [];
    for (const [open, close] of intervals) {
      const [oh, om] = hm(open);
      const [ch, cm] = hm(close);
      const y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate();
      const from = zonedToUtc(y, mo, d, oh, om, i.timezone);
      const to = zonedToUtc(y, mo, d, ch, cm, i.timezone);
      for (let s = from; s + dur <= to; s += step) {
        if (s < earliest || s >= latest || seen.has(s)) continue;
        const a = s - i.bufferBeforeMin * MIN;
        const b = s + dur + i.bufferAfterMin * MIN;
        const free = i.hosts.filter((h) => !overlaps(i.hostBusy[h.userId], a, b)).map((h) => h.userId);
        const slot = (hostIds: string[], seatsLeft?: number): Slot => ({ start: new Date(s).toISOString(), end: new Date(s + dur).toISOString(), hostIds, ...(seatsLeft === undefined ? {} : { seatsLeft }) });
        if (i.type === "class") {
          const taken = sessions.get(s);
          if (taken !== undefined) {
            if (taken < i.capacity!) { seen.add(s); out.push(slot(i.hosts.map((h) => h.userId), i.capacity! - taken)); }
          } else if (free.length) { seen.add(s); out.push(slot(free, i.capacity!)); }
        } else if (i.type === "collective") {
          if (free.length === i.hosts.length) { seen.add(s); out.push(slot(free)); }
        } else if (free.length) { seen.add(s); out.push(slot(i.type === "personal" ? free.slice(0, 1) : free)); }
      }
    }
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}
