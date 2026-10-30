import { DomainError } from "../../errors.js";

export const FIELD_TYPES = ["text", "textarea", "email", "phone", "number", "select", "multiselect", "checkbox", "date"] as const;
export type BookingField = {
  key: string;
  label: string;
  type: (typeof FIELD_TYPES)[number];
  required: boolean;
  placeholder?: string;
  options?: string[];
  /** CRM contact field this answer is saved to; type and options come from it. */
  contactFieldKey?: string;
};

const MAX_FIELDS = 20;
const bad = (m: string): never => { throw new DomainError("invalid_input", m); };

const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** Validates the client's booking form. Keys are generated from labels on creation and stay stable after that. */
export function parseBookingForm(input: unknown): BookingField[] {
  if (!Array.isArray(input)) return bad("booking_form must be a list of fields.");
  if (input.length > MAX_FIELDS) bad(`A booking form can have at most ${MAX_FIELDS} fields.`);
  const seen = new Set<string>();
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") return bad(`Field ${i + 1} must be an object.`);
    const f = raw as Record<string, unknown>;
    const label = typeof f.label === "string" ? f.label.trim() : "";
    if (!label || label.length > 120) bad(`Field ${i + 1}: label is required, up to 120 characters.`);
    if (!(FIELD_TYPES as readonly unknown[]).includes(f.type)) bad(`Field "${label}": unknown type.`);
    const type = f.type as BookingField["type"];
    const key = typeof f.key === "string" && f.key ? f.key : keyOf(label);
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) bad(`Field "${label}": key must be lowercase letters, digits and underscores.`);
    if (seen.has(key)) bad(`Field "${label}": duplicate key "${key}".`);
    seen.add(key);
    const out: BookingField = { key, label, type, required: f.required === true };
    if (typeof f.placeholder === "string" && f.placeholder.trim()) out.placeholder = f.placeholder.trim().slice(0, 200);
    if (typeof f.contactFieldKey === "string" && f.contactFieldKey) out.contactFieldKey = f.contactFieldKey.slice(0, 40);
    if (type === "select" || type === "multiselect") {
      const o = f.options;
      if (!Array.isArray(o) || o.length < 1 || o.length > 100 || o.some((x) => typeof x !== "string" || !x.trim() || x.length > 120)) bad(`Field "${label}": provide 1 to 100 options.`);
      out.options = (o as string[]).map((x) => x.trim());
    }
    return out;
  });
}

export type StoredAnswer = { key: string; label: string; type: BookingField["type"]; value: unknown };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Checks a visitor's answers against the calendar's current form. Unknown keys are dropped.
 * Returns the snapshot stored on the booking (with labels, so later edits never break old bookings)
 * and the values of fields mapped to contact fields.
 */
export function validateAnswers(form: BookingField[], raw: unknown, parsePhone: (v: string) => string): { answers: StoredAnswer[]; mapped: Record<string, unknown> } {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const answers: StoredAnswer[] = [];
  const mapped: Record<string, unknown> = {};
  for (const f of form) {
    let v = given[f.key];
    const fail = (m: string): never => bad(`${f.label}: ${m}`);
    if (f.type === "checkbox" ? v !== true && f.required : isEmpty(v) && f.required) fail("this is required.");
    if (isEmpty(v) || (f.type === "checkbox" && v !== true)) continue;
    switch (f.type) {
      case "text": case "textarea": if (typeof v !== "string" || v.length > 2000) fail("enter up to 2,000 characters."); v = (v as string).trim(); break;
      case "email": if (typeof v !== "string" || !EMAIL.test(v.trim()) || v.length > 254) fail("enter a valid email address."); v = (v as string).trim().toLowerCase(); break;
      case "phone": if (typeof v !== "string") fail("enter a phone number."); v = parsePhone(v as string); break;
      case "number": { const n = typeof v === "string" && v.trim() ? Number(v) : v; if (typeof n !== "number" || !Number.isFinite(n)) fail("enter a number."); v = n; break; }
      case "select": if (typeof v !== "string" || !f.options?.includes(v)) fail("choose one of the options."); break;
      case "multiselect": if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !f.options?.includes(x))) fail("choose from the options."); v = [...new Set(v as string[])]; break;
      case "checkbox": break;
      case "date": if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) fail("enter a date."); break;
    }
    answers.push({ key: f.key, label: f.label, type: f.type, value: v });
    if (f.contactFieldKey) mapped[f.contactFieldKey] = v;
  }
  return { answers, mapped };
}
