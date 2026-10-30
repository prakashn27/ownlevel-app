import { type SQL, sql } from "drizzle-orm";
import { type Db, type Tx, user, withTenant } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { type CrmScope, type CrmAction, requireCrm } from "./access.js";
import { runDeleteHooks } from "./erase.js";
import { OPS, PRIMARY_SUB, SUBS, parseValue, searchStrings } from "./field-types.js";
import { loadFields } from "./metadata.js";
import { objectDef } from "./objects.js";
import type { FieldDef, ObjectDef } from "./types.js";
import { textArray } from "./sql.js";
import { type Mode, validateInput } from "./validate.js";

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE = 100;

export type ActorSource = "staff" | "booking" | "import" | "api" | "mcp" | "workflow" | "contact";

const ident = (name: string) => sql.identifier(name);
const col = (f: FieldDef, sub?: string) => ident(sub ? `${f.key}_${sub}` : f.key);
const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;

// ── Reading: columns / data → one value per field ──
function readValue(row: Row, f: FieldDef): unknown {
  const subs = SUBS[f.type];
  if (!f.standard) return (row.data as Record<string, unknown> | undefined)?.[f.key] ?? null;
  if (!subs) return row[f.key] ?? null;
  const out: Record<string, unknown> = {};
  let any = false;
  for (const s of subs) {
    let v = row[`${f.key}_${s.name}`] ?? null;
    if (s.sql === "numeric" && v !== null) v = Number(v);
    if (v !== null && !(Array.isArray(v) && v.length === 0)) any = true;
    out[s.name] = v;
  }
  return any ? out : null;
}

function toRecord(row: Row, fields: FieldDef[]) {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.active || f.system) continue;
    const v = readValue(row, f);
    if (v !== null) values[f.key] = v;
  }
  return {
    id: row.id as string,
    fields: values,
    created_by: { source: row.created_by_source, user_id: row.created_by_user_id ?? null, name: row.created_by_name ?? null },
    created_at: new Date(row.created_at as string | Date).toISOString(),
    updated_at: new Date(row.updated_at as string | Date).toISOString(),
  };
}

const searchText = (row: Row, fields: FieldDef[], def: ObjectDef) =>
  fields.filter((f) => def.searchable.includes(f.key)).flatMap((f) => searchStrings(readValue(row, f))).join(" ").toLowerCase();

// ── Writing ──
type Cell = [string, SQL];

/** Column assignments for standard fields; custom values go to the `data` patch. */
function plan(fields: FieldDef[], values: Map<string, unknown>) {
  const cells: Cell[] = [];
  const patch: Record<string, unknown> = {};
  const remove: string[] = [];
  for (const [key, value] of values) {
    const f = fields.find((x) => x.key === key)!;
    if (!f.standard) {
      if (value === null) remove.push(key);
      else patch[key] = value;
      continue;
    }
    const subs = SUBS[f.type];
    if (!subs) cells.push([f.key, value === null ? sql`null` : sql`${value}`]);
    else {
      const o = (value ?? {}) as Record<string, unknown>;
      for (const s of subs) {
        const v = o[s.name];
        cells.push([`${f.key}_${s.name}`, s.sql === "jsonb" ? json(v ?? []) : v === undefined || v === null ? sql`null` : sql`${v}`]);
      }
    }
  }
  return { cells, patch, remove };
}

async function actorOf(tx: Tx, userId: string, source: ActorSource) {
  const [u] = await tx.select({ name: user.name }).from(user).where(sql`${user.id} = ${userId}`);
  return { source, userId, name: u?.name ?? null };
}

function checkIdentified(row: Row, fields: FieldDef[], def: ObjectDef) {
  const has = fields.some((f) => f.active && def.identifiers.includes(f.key) && readValue(row, f) !== null);
  if (!has) throw new DomainError("invalid_input", "A contact needs at least a name, an email or a phone.");
}

const isUniqueViolation = (e: unknown) => (e as { cause?: { code?: string } }).cause?.code === "23505";

async function emailConflict(tx: Tx, clientId: string, table: string, email: string | null, exceptId?: string) {
  if (!email) return;
  const r = await tx.execute(sql`select id from ${ident(table)} where client_id = ${clientId} and emails_primary_email = ${email} ${exceptId ? sql`and id <> ${exceptId}` : sql``}`);
  const hit = r.rows[0] as { id: string } | undefined;
  if (hit) throw new DomainError("conflict", "A contact with this email already exists.", { id: hit.id });
}

const primaryEmail = (values: Map<string, unknown>) => ((values.get("emails") as { primary_email?: string } | null | undefined)?.primary_email ?? null) || null;

/** Runs `fn` as the caller inside the client's context after the permission check. */
const scoped = <T>(db: Db, scope: CrmScope, action: CrmAction, fn: (tx: Tx) => Promise<T>) =>
  withTenant(db, scope, async (tx) => {
    await requireCrm(tx, scope, action);
    return fn(tx);
  });

async function fetchRow(tx: Tx, def: ObjectDef, clientId: string, id: string): Promise<Row> {
  if (!UUID.test(id)) throw new DomainError("not_found", "Not found.");
  const r = await tx.execute(sql`select * from ${ident(def.table)} where client_id = ${clientId} and id = ${id}`);
  if (!r.rows[0]) throw new DomainError("not_found", "Not found.");
  return r.rows[0] as Row;
}

/** Brings search_text in line with the stored values. */
async function refreshSearch(tx: Tx, def: ObjectDef, fields: FieldDef[], row: Row): Promise<Row> {
  const text = searchText(row, fields, def);
  if (text === row.search_text) return row;
  await tx.execute(sql`update ${ident(def.table)} set search_text = ${text} where id = ${row.id as string}`);
  return { ...row, search_text: text };
}

type Actor = { source: ActorSource; userId: string | null; name: string | null };
type WriteScope = { agencyId: string; clientId: string };

/** Inserts an already validated record. Shared by the API (a signed-in actor) and public booking (no user). */
export async function insertRecordTx(tx: Tx, scope: WriteScope, object: string, fields: FieldDef[], values: Map<string, unknown>, actor: Actor) {
  const def = objectDef(object);
  const { cells, patch } = plan(fields, values);
  await emailConflict(tx, scope.clientId, def.table, primaryEmail(values));
  const all: Cell[] = [
    ["agency_id", sql`${scope.agencyId}`], ["client_id", sql`${scope.clientId}`],
    ["created_by_source", sql`${actor.source}`], ["created_by_user_id", sql`${actor.userId}`], ["created_by_name", sql`${actor.name}`],
    ["data", json(patch)], ...cells,
  ];
  let row: Row;
  try {
    const r = await tx.execute(sql`insert into ${ident(def.table)} (${sql.join(all.map(([c]) => ident(c)), sql`, `)}) values (${sql.join(all.map(([, v]) => v), sql`, `)}) returning *`);
    row = r.rows[0] as Row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("conflict", "A contact with this email already exists.");
    throw e;
  }
  checkIdentified(row, fields, def);
  return toRecord(await refreshSearch(tx, def, fields, row), fields);
}

/** Applies already validated values to an existing record. */
export async function patchRecordTx(tx: Tx, scope: WriteScope, object: string, fields: FieldDef[], id: string, values: Map<string, unknown>) {
  const def = objectDef(object);
  const { cells, patch, remove } = plan(fields, values);
  if (values.has("emails")) await emailConflict(tx, scope.clientId, def.table, primaryEmail(values), id);
  const sets: SQL[] = [
    sql`updated_at = now()`,
    ...cells.map(([c, v]) => sql`${ident(c)} = ${v}`),
    ...(Object.keys(patch).length || remove.length ? [sql`data = (data - ${textArray(remove)}) || ${json(patch)}`] : []),
  ];
  let row: Row;
  try {
    const r = await tx.execute(sql`update ${ident(def.table)} set ${sql.join(sets, sql`, `)} where client_id = ${scope.clientId} and id = ${id} returning *`);
    row = r.rows[0] as Row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("conflict", "A contact with this email already exists.");
    throw e;
  }
  checkIdentified(row, fields, def);
  return toRecord(await refreshSearch(tx, def, fields, row), fields);
}

export function createRecord(db: Db, scope: CrmScope, object: string, body: Record<string, unknown>, opts: { source?: ActorSource; mode?: Mode } = {}) {
  const def = objectDef(object);
  return scoped(db, scope, "write", async (tx) => {
    const fields = await loadFields(tx, scope.clientId, def);
    const values = validateInput(fields, body.fields, opts.mode ?? "staff", true);
    return insertRecordTx(tx, scope, object, fields, values, await actorOf(tx, scope.userId, opts.source ?? "staff"));
  });
}

export function updateRecord(db: Db, scope: CrmScope, object: string, id: string, body: Record<string, unknown>, opts: { mode?: Mode } = {}) {
  const def = objectDef(object);
  return scoped(db, scope, "write", async (tx) => {
    await fetchRow(tx, def, scope.clientId, id);
    const fields = await loadFields(tx, scope.clientId, def);
    const values = validateInput(fields, body.fields, opts.mode ?? "staff", false);
    return patchRecordTx(tx, scope, object, fields, id, values);
  });
}

export function getRecord(db: Db, scope: CrmScope, object: string, id: string) {
  const def = objectDef(object);
  return scoped(db, scope, "read", async (tx) => toRecord(await fetchRow(tx, def, scope.clientId, id), await loadFields(tx, scope.clientId, def)));
}

/** Permanent. Hooks registered by other modules clear what they hold about the record in the same transaction. */
export function deleteRecord(db: Db, scope: CrmScope, object: string, id: string) {
  const def = objectDef(object);
  return scoped(db, scope, "delete", async (tx) => {
    await fetchRow(tx, def, scope.clientId, id);
    await runDeleteHooks(tx, { clientId: scope.clientId, object: def.key, id });
    await tx.execute(sql`delete from ${ident(def.table)} where client_id = ${scope.clientId} and id = ${id}`);
    return { ok: true };
  });
}

// ── Listing ──
export type Filter = { key: string; op: string; value?: unknown };
export type ListQuery = { q?: string; filter?: Filter[]; sort?: string; cursor?: string; limit?: number };

/** Text view of a field, for contains / equality / ordering. Composite types use their primary sub-field. */
function textExpr(f: FieldDef): SQL {
  const sub = PRIMARY_SUB[f.type];
  if (f.type === "full_name") {
    return f.standard
      ? sql`nullif(concat_ws(' ', ${col(f, "first_name")}, ${col(f, "last_name")}), '')`
      : sql`nullif(concat_ws(' ', data #>> array[${f.key}, 'first_name'], data #>> array[${f.key}, 'last_name']), '')`;
  }
  if (f.standard) return sub ? sql`${col(f, sub)}::text` : sql`${col(f)}::text`;
  return sub ? sql`data #>> array[${f.key}, ${sub}]` : sql`data ->> ${f.key}`;
}

const isArrayType = (f: FieldDef) => f.type === "multi_select" || f.type === "array";
const isNumeric = (f: FieldDef) => f.type === "number" || f.type === "currency";
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function condition(f: FieldDef, op: string, value: unknown): SQL {
  if (!OPS[f.type].includes(op)) throw new DomainError("invalid_input", `Can't filter ${f.label} (${f.key}) with "${op}".`);
  if (isArrayType(f)) {
    const arr = sql`data -> ${f.key}`;
    if (op === "is_empty") return sql`(${arr} is null or jsonb_array_length(${arr}) = 0)`;
    if (op === "is_not_empty") return sql`(${arr} is not null and jsonb_array_length(${arr}) > 0)`;
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new DomainError("invalid_input", `${f.label}: value must be a list of text.`);
    return op === "has_any" ? sql`${arr} ?| ${textArray(value as string[])}` : sql`${arr} ?& ${textArray(value as string[])}`;
  }
  const t = textExpr(f);
  if (op === "is_empty") return sql`${t} is null`;
  if (op === "is_not_empty") return sql`${t} is not null`;
  if (op === "contains") {
    if (typeof value !== "string") throw new DomainError("invalid_input", `${f.label}: value must be text.`);
    return sql`${t} ilike ${`%${escapeLike(value)}%`}`;
  }
  if (op === "in") {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new DomainError("invalid_input", `${f.label}: value must be a list of text.`);
    return sql`${t} = any(${textArray(value as string[])})`;
  }
  const cmp = { eq: sql`=`, neq: sql`is distinct from`, gt: sql`>`, gte: sql`>=`, lt: sql`<`, lte: sql`<=` }[op];
  if (!cmp) throw new DomainError("invalid_input", `Unknown operator "${op}".`);
  if (isNumeric(f)) {
    const n = typeof value === "number" ? value : Number(value);
    if (value === null || value === "" || !Number.isFinite(n)) throw new DomainError("invalid_input", `${f.label}: value must be a number.`);
    return sql`(${t})::numeric ${cmp} ${n}`;
  }
  if (f.type === "boolean") return sql`(${t})::boolean ${cmp} ${parseValue(f, value)}`;
  if (f.type === "date" || f.type === "date_time") return sql`${t} ${cmp} ${parseValue(f, value) as string}`;
  if (typeof value !== "string") throw new DomainError("invalid_input", `${f.label}: value must be text.`);
  if (op === "eq") return sql`lower(${t}) = lower(${value})`;
  if (op === "neq") return sql`lower(coalesce(${t}, '')) <> lower(${value})`;
  return sql`${t} ${cmp} ${value}`;
}

const encodeCursor = (n: number) => Buffer.from(String(n)).toString("base64url");
function decodeCursor(c?: string) {
  if (!c) return 0;
  const raw = Buffer.from(c, "base64url").toString();
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || String(n) !== raw) throw new DomainError("invalid_input", "Invalid cursor.");
  return n;
}

export function listRecords(db: Db, scope: CrmScope, object: string, query: ListQuery = {}) {
  const def = objectDef(object);
  return scoped(db, scope, "read", async (tx) => {
    const fields = await loadFields(tx, scope.clientId, def);
    const byKey = new Map(fields.filter((f) => f.active && !f.system).map((f) => [f.key, f]));
    const where: SQL[] = [sql`client_id = ${scope.clientId}`];

    const q = query.q?.trim().toLowerCase();
    if (q) where.push(sql`search_text like ${`%${escapeLike(q)}%`}`);
    for (const flt of query.filter ?? []) {
      const f = byKey.get(flt.key);
      if (!f) throw new DomainError("invalid_input", `Unknown field "${flt.key}".`);
      where.push(condition(f, flt.op, flt.value));
    }

    let order = sql`created_at desc`;
    if (query.sort) {
      const [key, dir = "asc"] = query.sort.split(":");
      if (dir !== "asc" && dir !== "desc") throw new DomainError("invalid_input", "Sort direction must be asc or desc.");
      const d = dir === "desc" ? sql`desc` : sql`asc`;
      if (key === "created_at" || key === "updated_at" || key === "position") order = sql`${ident(key!)} ${d}`;
      else {
        const f = byKey.get(key!);
        if (!f || isArrayType(f)) throw new DomainError("invalid_input", `Can't sort by "${key}".`);
        order = sql`${isNumeric(f) ? sql`(${textExpr(f)})::numeric` : textExpr(f)} ${d} nulls last`;
      }
    }

    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), MAX_PAGE);
    const offset = decodeCursor(query.cursor);
    const r = await tx.execute(sql`select * from ${ident(def.table)} where ${sql.join(where, sql` and `)} order by ${order}, id limit ${limit + 1} offset ${offset}`);
    const rows = r.rows as Row[];
    return {
      items: rows.slice(0, limit).map((row) => toRecord(row, fields)),
      next_cursor: rows.length > limit ? encodeCursor(offset + limit) : null,
    };
  });
}
