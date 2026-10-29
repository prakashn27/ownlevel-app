import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  agencies,
  clients,
  invitations,
  memberships,
  roles,
  user,
  withTenant,
  type Branding,
  type Db,
  type Tx,
} from "../../db/index.js";
import { DomainError } from "../../errors.js";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const INVITABLE = ["agency_admin", "agency_user"] as const;
const INVITABLE_CLIENT = ["client_admin", "client_user"] as const;

/** NULL-aware match: agency-level rows have no client. */
const forClient = (col: typeof memberships.clientId | typeof invitations.clientId, clientId?: string) => (clientId ? eq(col, clientId) : isNull(col));

type Scope = { userId: string; agencyId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The client must exist in the agency in scope (RLS already hides other agencies' clients). */
export async function assertClient(tx: Tx, agencyId: string, clientId: string) {
  if (!UUID.test(clientId)) throw new DomainError("not_found", "Client not found.");
  const [c] = await tx.select({ id: clients.id, status: clients.status }).from(clients).where(and(eq(clients.id, clientId), eq(clients.agencyId, agencyId)));
  if (!c) throw new DomainError("not_found", "Client not found.");
  return c;
}

/** Agency-level membership check inside a tenant transaction. Throws forbidden unless the user holds one of `allowed` roles. */
export async function requireRole(tx: Tx, userId: string, agencyId: string, allowed: string[]) {
  const [m] = await tx
    .select({ role: roles.key })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.userId, userId), eq(memberships.agencyId, agencyId), isNull(memberships.clientId)));
  if (!m || !allowed.includes(m.role)) throw new DomainError("forbidden", "You don't have permission to do that.");
  return m.role;
}

export const requireAgencyRole = (db: Db, ctx: Scope, allowed: string[]) =>
  withTenant(db, ctx, (tx) => requireRole(tx, ctx.userId, ctx.agencyId, allowed));

export async function hasAgencyMembership(db: Db, userId: string, agencyId: string) {
  return withTenant(db, { agencyId, userId }, async (tx) => {
    const [m] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.agencyId, agencyId), isNull(memberships.clientId)));
    return !!m;
  });
}

// ── Branding ──
const clean = (v: unknown, max: number, label: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new DomainError("invalid_input", `${label} must be text.`);
  const s = v.trim();
  if (s.length > max) throw new DomainError("invalid_input", `${label} must be at most ${max} characters.`);
  return s || undefined;
};

export function parseBranding(input: Record<string, unknown>): Branding {
  const out: Branding = {};
  const appName = clean(input.appName, 60, "App name");
  if (appName) out.appName = appName;
  const clientLabel = clean(input.clientLabel, 30, "Client label");
  if (clientLabel) out.clientLabel = clientLabel;
  const color = clean(input.primaryColor, 7, "Primary color");
  if (color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new DomainError("invalid_input", "Primary color must look like #4f46e5.");
    out.primaryColor = color.toLowerCase();
  }
  const logo = clean(input.logoUrl, 500, "Logo URL");
  if (logo) {
    let u: URL;
    try { u = new URL(logo); } catch { throw new DomainError("invalid_input", "Logo URL is not a valid URL."); }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new DomainError("invalid_input", "Logo URL must be http(s).");
    out.logoUrl = logo;
  }
  return out;
}

export async function updateBranding(db: Db, ctx: { userId: string; agencyId: string }, input: Record<string, unknown>) {
  const branding = parseBranding(input);
  return withTenant(db, ctx, async (tx) => {
    await requireRole(tx, ctx.userId, ctx.agencyId, ["agency_owner", "agency_admin"]);
    await tx.update(agencies).set({ branding }).where(eq(agencies.id, ctx.agencyId));
    return branding;
  });
}

// ── Team + invitations ──
export const getTeam = (db: Db, ctx: Scope, clientId?: string) =>
  withTenant(db, ctx, async (tx) => {
  await requireRole(tx, ctx.userId, ctx.agencyId, ["agency_owner", "agency_admin", "agency_user"]);
  if (clientId) await assertClient(tx, ctx.agencyId, clientId);
  const members = await tx
    .select({ userId: user.id, name: user.name, email: user.email, role: roles.key, roleName: roles.name })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.agencyId, ctx.agencyId), forClient(memberships.clientId, clientId)));
  const pending = await tx
    .select({ id: invitations.id, email: invitations.email, role: roles.key, roleName: roles.name, expiresAt: invitations.expiresAt })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .where(
      and(
        eq(invitations.agencyId, ctx.agencyId),
        forClient(invitations.clientId, clientId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitations.createdAt));
  return { members, pending };
  });

export async function createInvitation(db: Db, ctx: Scope, input: { email: string; roleKey: string; clientId?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DomainError("invalid_input", "Enter a valid email address.");
  if (!((input.clientId ? INVITABLE_CLIENT : INVITABLE) as readonly string[]).includes(input.roleKey)) throw new DomainError("invalid_input", "Invalid role.");
  const token = randomBytes(32).toString("base64url");
  return withTenant(db, ctx, async (tx) => {
  const inviterRole = await requireRole(tx, ctx.userId, ctx.agencyId, ["agency_owner", "agency_admin"]);
  if (input.clientId) {
    const c = await assertClient(tx, ctx.agencyId, input.clientId);
    if (c.status !== "active") throw new DomainError("invalid_input", "This client is archived. Restore it before inviting people.");
  } else if (inviterRole === "agency_admin" && input.roleKey !== "agency_user")
    throw new DomainError("forbidden", "Admins can only invite roles below their own.");

  const [role] = await tx.select().from(roles).where(and(isNull(roles.agencyId), eq(roles.key, input.roleKey)));
  if (!role) throw new DomainError("invalid_input", "Role is not available.");

  const [existing] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.agencyId, ctx.agencyId), forClient(memberships.clientId, input.clientId), sql`lower(${user.email}) = ${email}`));
  if (existing) throw new DomainError("invalid_input", input.clientId ? "That person already has access to this client." : "That person is already on your team.");

  {
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.agencyId, ctx.agencyId), eq(invitations.email, email), forClient(invitations.clientId, input.clientId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    await tx.insert(invitations).values({
      agencyId: ctx.agencyId,
      clientId: input.clientId,
      email,
      roleId: role.id,
      tokenHash: hashToken(token),
      invitedBy: ctx.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
  }
  return { token, email, roleName: role.name };
  });
}

export async function revokeInvitation(db: Db, ctx: Scope, invitationId: string) {
  await withTenant(db, ctx, async (tx) => {
    await requireRole(tx, ctx.userId, ctx.agencyId, ["agency_owner", "agency_admin"]);
    const res = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, invitationId), eq(invitations.agencyId, ctx.agencyId), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (res.length === 0) throw new DomainError("not_found", "Invitation not found.");
  });
}

async function findUsableInvite(tx: Tx, agencyId: string, token: string) {
  const [inv] = await tx
    .select({
      id: invitations.id,
      email: invitations.email,
      roleId: invitations.roleId,
      clientId: invitations.clientId,
      roleName: roles.name,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .where(and(eq(invitations.tokenHash, hashToken(token)), eq(invitations.agencyId, agencyId)));
  // Same answer for unknown, wrong-agency, used, revoked and expired: reveals nothing.
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date())
    throw new DomainError("not_found", "This invitation is invalid or has expired.");
  return inv;
}

/** Public preview for the accept page; scoped to the host's agency. */
export const previewInvitation = (db: Db, agencyId: string, token: string) =>
  withTenant(db, { agencyId }, async (tx) => {
    const inv = await findUsableInvite(tx, agencyId, token);
    const [u] = await tx.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${inv.email}`);
    return { email: inv.email, roleName: inv.roleName, hasAccount: !!u };
  });

export async function acceptInvitation(db: Db, ctx: { userId: string; userEmail: string; agencyId: string }, token: string) {
  await withTenant(db, { agencyId: ctx.agencyId, userId: ctx.userId }, async (tx) => {
    const inv = await findUsableInvite(tx, ctx.agencyId, token);
    if (inv.email !== ctx.userEmail.toLowerCase())
      throw new DomainError("forbidden", `This invitation was sent to ${inv.email}. Sign in with that email.`);
    await tx
      .insert(memberships)
      .values({
        userId: ctx.userId,
        agencyId: ctx.agencyId,
        clientId: inv.clientId,
        roleId: inv.roleId,
        clientAccess: inv.clientId ? null : "all",
      })
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
  });
}
