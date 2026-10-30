import { DomainError } from "../../errors.js";
import { CUSTOM_TYPES, type CustomFieldType, type FieldDef, type FieldType } from "./types.js";

/** Composite types are stored as several columns named {field}_{sub} (or as one JSON object for custom fields). */
export type Sub = { name: string; sql: "text" | "jsonb" | "numeric" };

const T = (name: string): Sub => ({ name, sql: "text" });
const J = (name: string): Sub => ({ name, sql: "jsonb" });
const N = (name: string): Sub => ({ name, sql: "numeric" });

export const SUBS: Partial<Record<FieldType, Sub[]>> = {
  full_name: [T("first_name"), T("last_name")],
  emails: [T("primary_email"), J("additional_emails")],
  phones: [T("primary_phone_number"), T("primary_phone_country_code"), T("primary_phone_calling_code"), J("additional_phones")],
  links: [T("primary_link_url"), T("primary_link_label"), J("secondary_links")],
  address: [T("street1"), T("street2"), T("city"), T("postcode"), T("state"), T("country"), N("lat"), N("lng")],
  currency: [N("amount_micros"), T("currency_code")],
  rich_text: [T("markdown")],
};

/** The sub-field used for filtering and sorting a composite type. full_name uses both parts. */
export const PRIMARY_SUB: Partial<Record<FieldType, string>> = {
  emails: "primary_email",
  phones: "primary_phone_number",
  links: "primary_link_url",
  address: "city",
  currency: "amount_micros",
  rich_text: "markdown",
};

class Invalid extends Error {}
const bad = (msg: string): never => {
  throw new Invalid(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, max: number, what = "Value"): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return bad(`${what} must be text.`);
  const s = v.trim();
  if (s.length > max) return bad(`${what} must be at most ${max} characters.`);
  return s || null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function email(v: unknown, what: string): string | null {
  const s = str(v, 254, what)?.toLowerCase() ?? null;
  if (s && !EMAIL.test(s)) bad(`${what} is not a valid email address.`);
  return s;
}

function phone(v: unknown, what: string): string | null {
  const s = str(v, 32, what);
  if (!s) return null;
  const n = s.replace(/[\s\-().]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(n)) bad(`${what} must include the country code, like +14155550123.`);
  return n;
}

function url(v: unknown, what: string): string | null {
  const s = str(v, 2048, what);
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { return bad(`${what} is not a valid URL.`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") bad(`${what} must start with http:// or https://.`);
  return s;
}

function list<T>(v: unknown, max: number, what: string, item: (x: unknown) => T | null): T[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return bad(`${what} must be a list.`);
  if (v.length > max) bad(`${what} can have at most ${max} entries.`);
  return v.map(item).filter((x): x is T => x !== null);
}

function num(v: unknown, what: string): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return bad(`${what} must be a number.`);
  return n;
}

const obj = (v: unknown, what: string) => (isObj(v) ? v : bad(`${what} must be an object.`));
const isEmpty = (o: Record<string, unknown>) => Object.values(o).every((x) => x === null || (Array.isArray(x) && x.length === 0));

type Parser = (v: unknown, f: Pick<FieldDef, "settings" | "options">) => unknown;

const PARSERS: Record<FieldType, Parser> = {
  text: (v, f) => {
    const max = Math.min(Number(f.settings.maxLength ?? 255), 5000);
    return str(v, max);
  },
  number: (v, f) => {
    const n = num(v, "Value");
    const d = Number(f.settings.decimals ?? 0);
    if (d === 0 && !Number.isInteger(n)) bad("Value must be a whole number.");
    if (d > 0 && Math.round(n * 10 ** d) / 10 ** d !== n) bad(`Value can have at most ${d} decimals.`);
    if (typeof f.settings.min === "number" && n < f.settings.min) bad(`Value must be at least ${f.settings.min}.`);
    if (typeof f.settings.max === "number" && n > f.settings.max) bad(`Value must be at most ${f.settings.max}.`);
    return n;
  },
  boolean: (v) => (typeof v === "boolean" ? v : bad("Value must be true or false.")),
  date: (v) => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) return bad("Value must be a date like 2026-03-31.");
    return v;
  },
  date_time: (v) => {
    const d = typeof v === "string" ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return bad("Value must be a date and time like 2026-03-31T10:00:00Z.");
    return d.toISOString();
  },
  select: (v, f) => (typeof v === "string" && f.options?.some((o) => o.id === v) ? v : bad("Value is not one of the options.")),
  multi_select: (v, f) => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !f.options?.some((o) => o.id === x))) return bad("Values must be options.");
    const out = [...new Set(v as string[])];
    const max = Number(f.settings.maxSelected ?? 0);
    if (max && out.length > max) bad(`Choose at most ${max}.`);
    return out.length ? out : null;
  },
  rating: (v) => (typeof v === "string" && /^RATING_[1-5]$/.test(v) ? v : bad("Value must be RATING_1 to RATING_5.")),
  currency: (v, f) => {
    const o = obj(v, "Value");
    const micros = o.amount_micros === undefined || o.amount_micros === null ? null : num(o.amount_micros, "amount_micros");
    if (micros === null) return null;
    if (!Number.isInteger(micros)) bad("amount_micros must be a whole number.");
    const code = (str(o.currency_code, 3, "currency_code") ?? String(f.settings.defaultCurrency ?? "")).toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) bad("currency_code must be a 3-letter code like USD.");
    return { amount_micros: micros, currency_code: code };
  },
  full_name: (v) => {
    const o = obj(v, "Value");
    const out = { first_name: str(o.first_name, 100, "first_name"), last_name: str(o.last_name, 100, "last_name") };
    return isEmpty(out) ? null : out;
  },
  emails: (v) => {
    const o = obj(v, "Value");
    const primary = email(o.primary_email, "primary_email");
    const extra = list(o.additional_emails, 10, "additional_emails", (x) => email(x, "additional_emails"));
    const out = { primary_email: primary, additional_emails: [...new Set(extra)].filter((e) => e !== primary) };
    if (!primary && out.additional_emails.length) bad("additional_emails needs a primary_email.");
    return isEmpty(out) ? null : out;
  },
  phones: (v) => {
    const o = obj(v, "Value");
    const primary = phone(o.primary_phone_number, "primary_phone_number");
    const country = str(o.primary_phone_country_code, 2, "primary_phone_country_code")?.toUpperCase() ?? null;
    if (country && !/^[A-Z]{2}$/.test(country)) bad("primary_phone_country_code must be a 2-letter country code.");
    const calling = str(o.primary_phone_calling_code, 5, "primary_phone_calling_code");
    if (calling && !/^\+\d{1,4}$/.test(calling)) bad("primary_phone_calling_code must look like +1.");
    const extra = list(o.additional_phones, 10, "additional_phones", (x) => phone(x, "additional_phones"));
    const out = {
      primary_phone_number: primary,
      primary_phone_country_code: country,
      primary_phone_calling_code: calling,
      additional_phones: [...new Set(extra)].filter((p) => p !== primary),
    };
    if (!primary && out.additional_phones.length) bad("additional_phones needs a primary_phone_number.");
    return isEmpty(out) ? null : out;
  },
  links: (v) => {
    const o = obj(v, "Value");
    const out = {
      primary_link_url: url(o.primary_link_url, "primary_link_url"),
      primary_link_label: str(o.primary_link_label, 120, "primary_link_label"),
      secondary_links: list(o.secondary_links, 10, "secondary_links", (x) => {
        const l = obj(x, "secondary_links entries");
        const u = url(l.url, "secondary_links url");
        return u ? { url: u, label: str(l.label, 120, "secondary_links label") } : null;
      }),
    };
    return isEmpty(out) ? null : out;
  },
  address: (v) => {
    const o = obj(v, "Value");
    const out: Record<string, unknown> = {};
    for (const k of ["street1", "street2", "city", "postcode", "state", "country"]) out[k] = str(o[k], 120, k);
    for (const k of ["lat", "lng"]) out[k] = o[k] === undefined || o[k] === null ? null : num(o[k], k);
    return isEmpty(out) ? null : out;
  },
  rich_text: (v) => {
    const markdown = str(isObj(v) ? v.markdown : v, 50_000, "markdown");
    return markdown ? { markdown } : null;
  },
  array: (v) => {
    const out = list(v, 100, "Value", (x) => str(x, 255, "Entries"));
    return out.length ? out : null;
  },
  actor: () => bad("This field is set by the system."),
  position: () => bad("This field is set by the system."),
};

/** Canonicalizes one field value. Returns null for "no value" (clears the field). Throws DomainError naming the field. */
export function parseValue(field: Pick<FieldDef, "key" | "label" | "type" | "settings" | "options">, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  try {
    return PARSERS[field.type](value, field);
  } catch (e) {
    if (e instanceof Invalid) throw new DomainError("invalid_input", `${field.label} (${field.key}): ${e.message}`);
    throw e;
  }
}

/** Plain-text pieces of a value, for search_text. */
export function searchStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(searchStrings);
  if (isObj(v)) return Object.values(v).flatMap(searchStrings);
  return [];
}

export const isCustomType = (t: string): t is CustomFieldType => (CUSTOM_TYPES as readonly string[]).includes(t);

/** Filter operators by type. */
export const OPS: Record<FieldType, string[]> = (() => {
  const text = ["eq", "neq", "contains", "is_empty", "is_not_empty"];
  const numeric = ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"];
  const set = ["eq", "neq", "in", "is_empty", "is_not_empty"];
  const multi = ["has_any", "has_all", "is_empty", "is_not_empty"];
  return {
    text, rich_text: ["contains", "is_empty", "is_not_empty"], full_name: ["contains", "is_empty", "is_not_empty"],
    emails: text, phones: text, links: text, address: text,
    number: numeric, currency: numeric, date: numeric, date_time: numeric,
    boolean: ["eq", "is_empty", "is_not_empty"],
    select: set, rating: set,
    multi_select: multi, array: multi,
    actor: ["eq"], position: [],
  };
})();
