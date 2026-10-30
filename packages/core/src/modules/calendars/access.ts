import { and, eq, isNull, or } from "drizzle-orm";
import { memberships, roles, type Tx } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { assertClient } from "../identity/team.js";

export type CalendarScope = { userId: string; agencyId: string; clientId: string };

const ALL = ["agency_owner", "agency_admin", "agency_user", "client_admin", "client_user"];
const STAFF = ["agency_owner", "agency_admin", "agency_user", "client_admin"];

/** calendars:* permissions by action; becomes a permissions table later. */
const ALLOWED = {
  read: ALL,
  /** Create, publish, archive. */
  manage: ["agency_owner", "agency_admin"],
  /** Hours, overrides, hosts, slug, form. */
  configure: STAFF,
  /** Any appointment. client_user is limited to their own (see canTouch). */
  appointments: STAFF,
  /** The client's booking address and phone default country. */
  clientSettings: ["agency_owner", "agency_admin", "client_admin"],
  /** Create appointments and touch your own. */
  own: ALL,
} as const;
export type CalendarAction = keyof typeof ALLOWED;

/**
 * The caller must hold an agency-level membership in the client's agency, or a membership on this client.
 * Not a member: 404, so a client's existence is not revealed. Member without the permission: 403.
 * Returns the caller's role keys. (Agency users with "assigned" access are treated as "all" until client assignments exist.)
 */
export async function requireCalendars(tx: Tx, scope: CalendarScope, action: CalendarAction): Promise<string[]> {
  await assertClient(tx, scope.agencyId, scope.clientId);
  const rows = await tx
    .select({ role: roles.key })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(
      and(
        eq(memberships.userId, scope.userId),
        eq(memberships.agencyId, scope.agencyId),
        or(isNull(memberships.clientId), eq(memberships.clientId, scope.clientId)),
      ),
    );
  if (!rows.length) throw new DomainError("not_found", "Client not found.");
  const keys = rows.map((r) => r.role);
  if (!keys.some((k) => (ALLOWED[action] as readonly string[]).includes(k))) throw new DomainError("forbidden", "You don't have permission to do that.");
  return keys;
}

/** Staff roles may change any appointment; a client_user only ones they host or created. */
export function assertCanTouch(roleKeys: string[], userId: string, appt: { createdBy: string | null; hostIds: string[] }) {
  if (roleKeys.some((k) => (ALLOWED.appointments as readonly string[]).includes(k))) return;
  if (appt.createdBy === userId || appt.hostIds.includes(userId)) return;
  throw new DomainError("forbidden", "You can only change your own appointments.");
}
