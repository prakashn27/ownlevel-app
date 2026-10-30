import { and, eq, isNull, or } from "drizzle-orm";
import { memberships, roles, type Tx } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { assertClient } from "../identity/team.js";

export type CrmScope = { userId: string; agencyId: string; clientId: string };

const ALL = ["agency_owner", "agency_admin", "agency_user", "client_admin", "client_user"];
const MANAGERS = ["agency_owner", "agency_admin", "client_admin"];

/** crm:* permissions by action; becomes a permissions table later. */
const ALLOWED = { read: ALL, write: ALL, delete: MANAGERS, fields: MANAGERS } as const;
export type CrmAction = keyof typeof ALLOWED;

/**
 * The caller must hold an agency-level membership in the client's agency, or a membership on this client.
 * Not a member: 404, so a client's existence is not revealed. Member without the permission: 403.
 * (Agency users with "assigned" access are treated as "all" until client assignments exist.)
 */
export async function requireCrm(tx: Tx, scope: CrmScope, action: CrmAction) {
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
  if (!rows.some((r) => (ALLOWED[action] as readonly string[]).includes(r.role))) throw new DomainError("forbidden", "You don't have permission to do that.");
}
