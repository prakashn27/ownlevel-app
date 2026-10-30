import { DomainError } from "../../errors.js";
import { parseValue } from "./field-types.js";
import type { FieldDef } from "./types.js";

/**
 * staff: UI, API, staff MCP tools, import. Unknown or inactive keys are rejected; all active, non-system fields are writable.
 * contact: public booking, contact portal, contact MCP. Unknown keys are dropped; only `contactInput` fields are writable.
 */
export type Mode = "staff" | "contact";

/** Canonical value per key; null means "clear". Throws DomainError naming the field. */
export function validateInput(fields: FieldDef[], input: unknown, mode: Mode, create: boolean): Map<string, unknown> {
  if (input === undefined || input === null) input = {};
  if (typeof input !== "object" || Array.isArray(input)) throw new DomainError("invalid_input", "`fields` must be an object.");
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out = new Map<string, unknown>();

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const f = byKey.get(key);
    const writable = f && f.active && !f.system && (mode === "staff" || f.contactInput);
    if (!writable) {
      if (mode === "staff") throw new DomainError("invalid_input", `Unknown field "${key}".`);
      continue;
    }
    const value = parseValue(f, raw);
    if (value === null && f.required) throw new DomainError("invalid_input", `${f.label} (${f.key}) is required.`);
    out.set(key, value);
  }

  if (create) {
    for (const f of fields) {
      if (!f.active || f.system || out.has(f.key)) continue;
      if (mode === "staff" && f.defaultValue !== null && f.defaultValue !== undefined) out.set(f.key, parseValue(f, f.defaultValue));
      else if (f.required && (mode === "staff" || f.contactInput)) throw new DomainError("invalid_input", `${f.label} (${f.key}) is required.`);
    }
  }
  return out;
}
