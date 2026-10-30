import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { crmFields, type Db, type Tx, withTenant } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { type CrmScope, requireCrm } from "./access.js";
import { isCustomType } from "./field-types.js";
import { objectDef } from "./objects.js";
import { textArray } from "./sql.js";
import { RESERVED_KEYS } from "./standard/contact.js";
import type { FieldDef, FieldOption, ObjectDef } from "./types.js";

const MAX_CUSTOM_FIELDS = 100;
const MAX_OPTIONS = 200;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Effective field list: code definitions + the client's overrides + its custom fields, in display order. */
export async function loadFields(tx: Tx, clientId: string, def: ObjectDef): Promise<FieldDef[]> {
  const rows = await tx.select().from(crmFields).where(and(eq(crmFields.clientId, clientId), eq(crmFields.object, def.key)));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: FieldDef[] = def.fields.map((f, i) => {
    const o = byKey.get(f.key);
    return {
      key: f.key,
      type: f.type,
      label: o?.label ?? f.label,
      description: o?.description ?? null,
      standard: true,
      system: !!f.system,
      canDeactivate: f.canDeactivate !== false,
      active: f.canDeactivate === false ? true : (o?.active ?? true),
      required: f.canDeactivate === false && f.key === "name" ? false : (o?.required ?? false),
      contactInput: o?.contactInput ?? false,
      position: o?.position ?? (i + 1) * 10,
      settings: f.settings ?? {},
      options: null,
      defaultValue: null,
    };
  });
  const standardKeys = new Set(def.fields.map((f) => f.key));
  for (const r of rows) {
    if (standardKeys.has(r.key) || r.standard || !r.type) continue;
    out.push({
      key: r.key,
      type: r.type as FieldDef["type"],
      label: r.label ?? r.key,
      description: r.description,
      standard: false,
      system: false,
      canDeactivate: true,
      active: r.active,
      required: r.required,
      contactInput: r.contactInput,
      position: r.position ?? 1000,
      settings: r.settings,
      options: r.options,
      defaultValue: r.defaultValue ?? null,
    });
  }
  return out.sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
}

/** What the API and UI see: system fields are hidden. */
const publicField = (f: FieldDef) => ({
  key: f.key, type: f.type, label: f.label, description: f.description, standard: f.standard, can_deactivate: f.canDeactivate,
  active: f.active, required: f.required, contact_input: f.contactInput, position: f.position, settings: f.settings, options: f.options,
});

export const getMetadata = (db: Db, scope: CrmScope, object: string) =>
  withTenant(db, scope, async (tx) => {
    await requireCrm(tx, scope, "read");
    const def = objectDef(object);
    return { object: def.key, fields: (await loadFields(tx, scope.clientId, def)).filter((f) => !f.system).map(publicField) };
  });

// ── input parsing ──
const text = (v: unknown, max: number, label: string): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new DomainError("invalid_input", `${label} must be text.`);
  const s = v.trim();
  if (s.length > max) throw new DomainError("invalid_input", `${label} must be at most ${max} characters.`);
  return s || null;
};
const bool = (v: unknown, label: string): boolean | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw new DomainError("invalid_input", `${label} must be true or false.`);
  return v;
};

function parseOptions(v: unknown, existing: FieldOption[] = []): FieldOption[] {
  if (!Array.isArray(v) || v.length === 0) throw new DomainError("invalid_input", "Options must be a non-empty list.");
  if (v.length > MAX_OPTIONS) throw new DomainError("invalid_input", `At most ${MAX_OPTIONS} options.`);
  const byId = new Map(existing.map((o) => [o.id, o]));
  const seen = new Set<string>();
  return v.map((raw, position) => {
    const o = typeof raw === "string" ? { label: raw } : (raw as Record<string, unknown>);
    const label = text(o?.label, 120, "Option label");
    if (!label) throw new DomainError("invalid_input", "Option label is required.");
    if (seen.has(label.toLowerCase())) throw new DomainError("invalid_input", `Duplicate option "${label}".`);
    seen.add(label.toLowerCase());
    const id = typeof o.id === "string" && byId.has(o.id) ? o.id : `opt_${randomBytes(4).toString("hex")}`;
    const color = text(o.color, 20, "Option color") ?? undefined;
    return { id, label, position, ...(color ? { color } : {}) };
  });
}

function parseSettings(type: string, v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new DomainError("invalid_input", "Settings must be an object.");
  const s = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const int = (k: string, lo: number, hi: number) => {
    if (s[k] === undefined) return;
    if (!Number.isInteger(s[k]) || (s[k] as number) < lo || (s[k] as number) > hi) throw new DomainError("invalid_input", `${k} must be a whole number from ${lo} to ${hi}.`);
    out[k] = s[k];
  };
  const numeric = (k: string) => {
    if (s[k] === undefined) return;
    if (typeof s[k] !== "number" || !Number.isFinite(s[k])) throw new DomainError("invalid_input", `${k} must be a number.`);
    out[k] = s[k];
  };
  if (type === "text") int("maxLength", 1, 5000);
  if (type === "number") { int("decimals", 0, 6); numeric("min"); numeric("max"); }
  if (type === "multi_select") int("maxSelected", 1, MAX_OPTIONS);
  if (type === "currency" && s.defaultCurrency !== undefined) {
    if (typeof s.defaultCurrency !== "string" || !/^[A-Za-z]{3}$/.test(s.defaultCurrency)) throw new DomainError("invalid_input", "defaultCurrency must be a 3-letter code.");
    out.defaultCurrency = s.defaultCurrency.toUpperCase();
  }
  if (type === "phones" && s.defaultCountry !== undefined) {
    if (typeof s.defaultCountry !== "string" || !/^[A-Za-z]{2}$/.test(s.defaultCountry)) throw new DomainError("invalid_input", "defaultCountry must be a 2-letter code.");
    out.defaultCountry = s.defaultCountry.toUpperCase();
  }
  return out;
}

const slugKey = (label: string) => {
  let k = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!/^[a-z]/.test(k)) k = `f_${k}`.slice(0, 40).replace(/_+$/, "");
  return k;
};

const hasOptions = (t: string) => t === "select" || t === "multi_select";

async function usage(tx: Tx, def: ObjectDef, clientId: string, key: string) {
  const r = await tx.execute(sql`select count(*)::int as n from ${sql.identifier(def.table)} where client_id = ${clientId} and data ? ${key}`);
  return Number((r.rows[0] as { n: number }).n);
}

export async function fieldUsage(db: Db, scope: CrmScope, object: string, key: string) {
  return withTenant(db, scope, async (tx) => {
    await requireCrm(tx, scope, "fields");
    const def = objectDef(object);
    const f = (await loadFields(tx, scope.clientId, def)).find((x) => x.key === key && !x.standard);
    if (!f) throw new DomainError("not_found", "Field not found.");
    return { records: await usage(tx, def, scope.clientId, key) };
  });
}

export async function createField(db: Db, scope: CrmScope, object: string, input: Record<string, unknown>) {
  const label = text(input.label, 120, "Label");
  if (!label) throw new DomainError("invalid_input", "Label is required.");
  const type = String(input.type ?? "");
  if (!isCustomType(type)) throw new DomainError("invalid_input", "Unknown field type.");
  const settings = parseSettings(type, input.settings);
  const options = hasOptions(type) ? parseOptions(input.options) : null;
  const key = input.key === undefined ? slugKey(label) : String(input.key);
  if (!KEY.test(key)) throw new DomainError("invalid_input", "Key must start with a letter and use lowercase letters, digits and underscores (up to 40).");
  return withTenant(db, scope, async (tx) => {
    await requireCrm(tx, scope, "fields");
    const def = objectDef(object);
    const fields = await loadFields(tx, scope.clientId, def);
    const taken = new Set([...fields.map((f) => f.key), ...def.fields.map((f) => f.key), ...RESERVED_KEYS]);
    let finalKey = key;
    if (input.key === undefined) for (let i = 2; taken.has(finalKey); i++) finalKey = `${key.slice(0, 36)}_${i}`;
    else if (taken.has(finalKey)) throw new DomainError("conflict", `A field with key "${finalKey}" already exists.`);
    if (fields.filter((f) => !f.standard).length >= MAX_CUSTOM_FIELDS) throw new DomainError("invalid_input", `At most ${MAX_CUSTOM_FIELDS} custom fields.`);
    const position = Math.max(0, ...fields.map((f) => f.position)) + 10;
    // Currency fields default to the client's currency.
    if (type === "currency" && !settings.defaultCurrency) {
      const r = await tx.execute(sql`select currency from clients where id = ${scope.clientId}`);
      settings.defaultCurrency = String((r.rows[0] as { currency: string }).currency);
    }
    await tx.insert(crmFields).values({
      agencyId: scope.agencyId, clientId: scope.clientId, object: def.key, key: finalKey, standard: false, type, label,
      description: text(input.description, 500, "Description"), settings, options,
      required: bool(input.required, "required") ?? false, contactInput: bool(input.contact_input, "contact_input") ?? false, position,
    });
    return publicField((await loadFields(tx, scope.clientId, def)).find((f) => f.key === finalKey)!);
  });
}

/** Conversions that keep every stored value valid. Anything else needs a new field. */
const SAFE_CONVERSIONS: Record<string, (key: string, currency: string) => ReturnType<typeof sql> | null> = {
  "text>rich_text": (k) => sql`jsonb_build_object('markdown', data ->> ${k})`,
  "select>multi_select": (k) => sql`jsonb_build_array(data -> ${k})`,
  "number>currency": (k, cur) => sql`jsonb_build_object('amount_micros', round((data ->> ${k})::numeric * 1000000), 'currency_code', ${cur}::text)`,
};

export async function updateField(db: Db, scope: CrmScope, object: string, key: string, input: Record<string, unknown>) {
  return withTenant(db, scope, async (tx) => {
    await requireCrm(tx, scope, "fields");
    const def = objectDef(object);
    const fields = await loadFields(tx, scope.clientId, def);
    const field = fields.find((f) => f.key === key && !f.system);
    if (!field) throw new DomainError("not_found", "Field not found.");

    const patch: Partial<typeof crmFields.$inferInsert> = { updatedAt: new Date() };
    if (input.label !== undefined) { const l = text(input.label, 120, "Label"); if (!l) throw new DomainError("invalid_input", "Label is required."); patch.label = l; }
    if (input.description !== undefined) patch.description = text(input.description, 500, "Description");
    const required = bool(input.required, "required"); if (required !== undefined) patch.required = required;
    const contactInput = bool(input.contact_input, "contact_input"); if (contactInput !== undefined) patch.contactInput = contactInput;
    if (input.position !== undefined) {
      if (typeof input.position !== "number" || !Number.isFinite(input.position)) throw new DomainError("invalid_input", "position must be a number.");
      patch.position = input.position;
    }
    const active = bool(input.active, "active");
    if (active !== undefined) {
      if (!active && !field.canDeactivate) throw new DomainError("invalid_input", `${field.label} can't be turned off.`);
      // A contact needs some way to be identified: emails and phones can't both be off.
      if (!active && (key === "emails" || key === "phones")) {
        const other = fields.find((f) => f.key === (key === "emails" ? "phones" : "emails"));
        if (other && !other.active) throw new DomainError("invalid_input", "Emails and phones can't both be turned off.");
      }
      patch.active = active;
    }

    if (!field.standard) {
      let type = field.type;
      if (input.type !== undefined && input.type !== field.type) {
        const to = String(input.type);
        const convert = SAFE_CONVERSIONS[`${field.type}>${to}`];
        const used = await usage(tx, def, scope.clientId, key);
        if (!isCustomType(to)) throw new DomainError("invalid_input", "Unknown field type.");
        if (used > 0 && !convert) throw new DomainError("invalid_input", `Type can't change from ${field.type} to ${to} while ${used} record(s) have a value. Create a new field instead.`);
        const cur = String((await tx.execute(sql`select currency from clients where id = ${scope.clientId}`)).rows[0]?.currency ?? "USD");
        if (used > 0 && convert) {
          await tx.execute(sql`update ${sql.identifier(def.table)} set data = jsonb_set(data, array[${key}::text], ${convert(key, cur)}) where client_id = ${scope.clientId} and data ? ${key}`);
        }
        type = to;
        patch.type = to;
        if (!hasOptions(to)) patch.options = null;
        patch.settings = to === "currency" ? { defaultCurrency: cur } : {};
      }
      if (input.settings !== undefined) patch.settings = parseSettings(type, input.settings);
      if (input.options !== undefined) {
        if (!hasOptions(type)) throw new DomainError("invalid_input", "This field type has no options.");
        const next = parseOptions(input.options, field.options ?? []);
        const kept = new Set(next.map((o) => o.id));
        const removed = (field.options ?? []).filter((o) => !kept.has(o.id)).map((o) => o.id);
        if (removed.length) {
          // Removed options are cleared from records that used them.
          const t = sql.identifier(def.table);
          if (type === "select") {
            await tx.execute(sql`update ${t} set data = data - ${key}::text where client_id = ${scope.clientId} and data ->> ${key} = any(${textArray(removed)})`);
          } else {
            await tx.execute(sql`update ${t} set data = jsonb_set(data, array[${key}::text],
              (select coalesce(jsonb_agg(v), '[]'::jsonb) from jsonb_array_elements(data -> ${key}) v where not ((v #>> '{}') = any(${textArray(removed)}))))
              where client_id = ${scope.clientId} and data ? ${key}`);
            await tx.execute(sql`update ${t} set data = data - ${key}::text where client_id = ${scope.clientId} and data -> ${key} = '[]'::jsonb`);
          }
        }
        patch.options = next;
      }
    } else if (input.type !== undefined || input.settings !== undefined || input.options !== undefined) {
      throw new DomainError("invalid_input", "Standard fields keep their type and settings.");
    }

    const [existing] = await tx.select({ id: crmFields.id }).from(crmFields).where(and(eq(crmFields.clientId, scope.clientId), eq(crmFields.object, def.key), eq(crmFields.key, key)));
    if (existing) await tx.update(crmFields).set(patch).where(eq(crmFields.id, existing.id));
    else await tx.insert(crmFields).values({ agencyId: scope.agencyId, clientId: scope.clientId, object: def.key, key, standard: true, ...patch });
    return publicField((await loadFields(tx, scope.clientId, def)).find((f) => f.key === key)!);
  });
}

/** Deletes a custom field and its values from every record, immediately. Turn the field off to keep its values. */
export async function deleteField(db: Db, scope: CrmScope, object: string, key: string) {
  return withTenant(db, scope, async (tx) => {
    await requireCrm(tx, scope, "fields");
    const def = objectDef(object);
    const f = (await loadFields(tx, scope.clientId, def)).find((x) => x.key === key);
    if (!f) throw new DomainError("not_found", "Field not found.");
    if (f.standard) throw new DomainError("invalid_input", "Standard fields can only be turned off.");
    await tx.execute(sql`update ${sql.identifier(def.table)} set data = data - ${key}::text where client_id = ${scope.clientId} and data ? ${key}`);
    await tx.delete(crmFields).where(and(eq(crmFields.clientId, scope.clientId), eq(crmFields.object, def.key), eq(crmFields.key, key)));
    return { ok: true };
  });
}
