import { sql } from "drizzle-orm";
import { DomainError } from "../../errors.js";
import type { Tx } from "../../db/index.js";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN = 60_000;
export const bad = (m: string): never => { throw new DomainError("invalid_input", m); };

export function text(v: unknown, max: number, label: string, required = false) {
  if (v === undefined || v === null) return required ? bad(`${label} is required.`) : undefined;
  if (typeof v !== "string") return bad(`${label} must be text.`);
  const s = v.trim();
  if (!s && required) bad(`${label} is required.`);
  if (s.length > max) bad(`${label} must be at most ${max} characters.`);
  return s || undefined;
}

export function integer(v: unknown, min: number, max: number, label: string) {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(`${label} must be a whole number from ${min} to ${max}.`);
  return v as number;
}

export function timezone(v: unknown) {
  const tz = text(v, 64, "Timezone");
  if (!tz) return undefined;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { bad("Unknown timezone."); }
  return tz;
}

export function instant(v: unknown, label: string) {
  if (typeof v !== "string") return bad(`${label} must be an ISO date-time.`);
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) bad(`${label} must be an ISO date-time.`);
  return ms;
}

export const uuid = (v: string, what: string) => { if (!UUID.test(v)) throw new DomainError("not_found", `${what} not found.`); return v; };

/** Constraint violation code on a (possibly drizzle-wrapped) Postgres error. */
export const pgCode = (e: unknown) => (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;

export const iso = (d: Date | string) => new Date(d).toISOString();

/** Busy ranges of the given hosts that overlap [from, to), from every client, as bare time ranges. */
export async function hostBusy(tx: Tx, userIds: string[], from: number, to: number) {
  const out: Record<string, { start: number; end: number }[]> = {};
  if (!userIds.length) return out;
  const arr = sql`array[${sql.join(userIds.map((u) => sql`${u}`), sql`, `)}]::text[]`;
  const r = await tx.execute(sql`select user_id, busy_start, busy_end from host_busy(${arr}, ${new Date(from).toISOString()}::timestamptz, ${new Date(to).toISOString()}::timestamptz)`);
  for (const row of r.rows as { user_id: string; busy_start: Date | string; busy_end: Date | string }[])
    (out[row.user_id] ??= []).push({ start: new Date(row.busy_start).getTime(), end: new Date(row.busy_end).getTime() });
  return out;
}
