import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { slugify } from "@ownlevel/tenancy";
import { agencies, clients, memberships, roles, withTenant, type Db } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { RESERVED } from "../calendars/calendars.js";
import { assertClient, requireRole } from "../identity/team.js";

type Scope = { userId: string; agencyId: string };
const ANY_AGENCY_ROLE = ["agency_owner", "agency_admin", "agency_user"];
const MANAGERS = ["agency_owner", "agency_admin"];
const STATUSES = ["active", "archived"] as const;

const text = (v: unknown, max: number, label: string, required = false) => {
  if (v === undefined || v === null) {
    if (required) throw new DomainError("invalid_input", `${label} is required.`);
    return undefined;
  }
  if (typeof v !== "string") throw new DomainError("invalid_input", `${label} must be text.`);
  const s = v.trim();
  if (!s && required) throw new DomainError("invalid_input", `${label} is required.`);
  if (s.length > max) throw new DomainError("invalid_input", `${label} must be at most ${max} characters.`);
  return s || undefined;
};

function parseTimezone(v: unknown) {
  const tz = text(v, 64, "Timezone");
  if (!tz) return undefined;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { throw new DomainError("invalid_input", "Unknown timezone."); }
  return tz;
}

function parseCurrency(v: unknown) {
  const c = text(v, 3, "Currency")?.toUpperCase();
  if (c && !/^[A-Z]{3}$/.test(c)) throw new DomainError("invalid_input", "Currency must be a 3-letter code like USD.");
  return c;
}

const columns = { id: clients.id, name: clients.name, timezone: clients.timezone, currency: clients.currency, status: clients.status, createdAt: clients.createdAt };

/** All clients of the agency. Any agency member may list them. */
export const listClients = (db: Db, ctx: Scope) =>
  withTenant(db, ctx, async (tx) => {
    await requireRole(tx, ctx.userId, ctx.agencyId, ANY_AGENCY_ROLE);
    return tx.select(columns).from(clients).where(eq(clients.agencyId, ctx.agencyId)).orderBy(asc(clients.name));
  });

/** Clients the user belongs to directly (client-level memberships) in this agency. Empty for agency staff. */
export const listMyClients = (db: Db, ctx: Scope) =>
  withTenant(db, ctx, (tx) =>
    tx
      .select({ clientId: clients.id, name: clients.name, status: clients.status, role: roles.key })
      .from(memberships)
      .innerJoin(clients, eq(clients.id, memberships.clientId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.agencyId, ctx.agencyId), isNotNull(memberships.clientId)))
      .orderBy(asc(clients.name)),
  );

/** One client. Agency staff, or a member of that client (404 otherwise, so existence isn't revealed). */
export const getClient = (db: Db, ctx: Scope, clientId: string) =>
  withTenant(db, ctx, async (tx) => {
    await assertClient(tx, ctx.agencyId, clientId);
    const mine = await tx
      .select({ role: roles.key })
      .from(memberships)
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.agencyId, ctx.agencyId), or(isNull(memberships.clientId), eq(memberships.clientId, clientId))));
    if (!mine.length) throw new DomainError("not_found", "Client not found.");
    const [c] = await tx.select(columns).from(clients).where(and(eq(clients.id, clientId), eq(clients.agencyId, ctx.agencyId)));
    return c!;
  });

export async function createClient(db: Db, ctx: Scope, input: Record<string, unknown>) {
  const name = text(input.name, 120, "Name", true)!;
  const timezone = parseTimezone(input.timezone);
  const currency = parseCurrency(input.currency);
  return withTenant(db, ctx, async (tx) => {
    await requireRole(tx, ctx.userId, ctx.agencyId, MANAGERS);
    // Omitted timezone/currency fall back to the agency's.
    const [agency] = await tx.select({ timezone: agencies.timezone, currency: agencies.currency, country: agencies.country }).from(agencies).where(eq(agencies.id, ctx.agencyId));
    // The booking page address is suggested from the name; the client can change it later.
    const base = slugify(name).replace(/-+$/, "").slice(0, 50);
    let slug = RESERVED.has(base) || base.length < 3 ? "client" : base;
    const root = slug;
    for (let n = 2; (await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.agencyId, ctx.agencyId), eq(clients.slug, slug)))).length; n++) slug = `${root}-${n}`;
    const [row] = await tx
      .insert(clients)
      .values({ agencyId: ctx.agencyId, name, slug, country: agency!.country, timezone: timezone ?? agency!.timezone, currency: currency ?? agency!.currency })
      .returning(columns);
    return row!;
  });
}

/** Partial update: name, timezone, currency, status (active | archived). Owners and admins only. */
export async function updateClient(db: Db, ctx: Scope, clientId: string, input: Record<string, unknown>) {
  const patch: Partial<{ name: string; timezone: string; currency: string; status: string }> = {};
  if (input.name !== undefined) patch.name = text(input.name, 120, "Name", true);
  const timezone = parseTimezone(input.timezone);
  if (timezone) patch.timezone = timezone;
  const currency = parseCurrency(input.currency);
  if (currency) patch.currency = currency;
  if (input.status !== undefined) {
    if (!(STATUSES as readonly unknown[]).includes(input.status)) throw new DomainError("invalid_input", "Status must be active or archived.");
    patch.status = input.status as string;
  }
  return withTenant(db, ctx, async (tx) => {
    await requireRole(tx, ctx.userId, ctx.agencyId, MANAGERS);
    await assertClient(tx, ctx.agencyId, clientId);
    if (Object.keys(patch).length === 0) throw new DomainError("invalid_input", "Nothing to update.");
    const [row] = await tx
      .update(clients)
      .set(patch)
      .where(and(eq(clients.id, clientId), eq(clients.agencyId, ctx.agencyId)))
      .returning(columns);
    return row!;
  });
}
