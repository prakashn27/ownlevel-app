/** Calendar dates in a given timezone, with no date library. */

// A "day key" is a calendar date, YYYY-MM-DD, with no timezone attached.
const pad = (n: number) => String(n).padStart(2, "0");
const fmts = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmts.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
export const dayKeyOf = (ms: number, tz: string) => { const p = parts(ms, tz); return `${p.year}-${pad(p.month)}-${pad(p.day)}`; };
export const minutesOfDay = (ms: number, tz: string) => { const p = parts(ms, tz); return p.hour * 60 + p.minute; };
export const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const weekdayOf = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
export const startOfWeek = (key: string) => addDays(key, -weekdayOf(key));
export const startOfMonth = (key: string) => `${key.slice(0, 7)}-01`;
export const addMonths = (key: string, n: number) => { const d = new Date(`${startOfMonth(key)}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
/** A day key as a Date that formats the same in any timezone when `timeZone: "UTC"` is used. */
export const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);

/** The instant at which the wall clock in `tz` reads the given day and time ("HH:MM"). */
export function zonedToUtc(key: string, time: string, tz: string) {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, min);
  const off = (ms: number) => { const p = parts(ms, tz); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
  const t = guess - off(guess);
  return guess - off(t);
}

/** Query window for a range of day keys, padded a day each side so timezone offsets never cut an appointment off. */
export const windowOf = (firstKey: string, lastKey: string) => ({
  from: new Date(Date.parse(`${firstKey}T00:00:00Z`) - 86_400_000).toISOString(),
  to: new Date(Date.parse(`${lastKey}T00:00:00Z`) + 2 * 86_400_000).toISOString(),
});

