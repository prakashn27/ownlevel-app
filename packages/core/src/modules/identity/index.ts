import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { slugify, subdomainHost, validateSlug, type HostConfig } from "@ownlevel/tenancy";
import { agencies, agencyDomains, memberships, roles, type Db } from "../../db/index.js";
import { DomainError } from "../../errors.js";

const SYSTEM_ROLES = [
  { level: "agency", key: "agency_owner", name: "Agency owner" },
  { level: "agency", key: "agency_admin", name: "Agency admin" },
  { level: "agency", key: "agency_user", name: "Agency user" },
  { level: "client", key: "client_admin", name: "Client admin" },
  { level: "client", key: "client_user", name: "Client user" },
] as const;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function systemRoleId(tx: Tx, key: string) {
  const [existing] = await tx.select({ id: roles.id }).from(roles).where(and(isNull(roles.agencyId), eq(roles.key, key)));
  if (existing) return existing.id;
  const def = SYSTEM_ROLES.find((r) => r.key === key)!;
  const [row] = await tx.insert(roles).values(def).onConflictDoNothing().returning({ id: roles.id });
  if (row) return row.id;
  const [again] = await tx.select({ id: roles.id }).from(roles).where(and(isNull(roles.agencyId), eq(roles.key, key)));
  return again!.id;
}

export type CreateAgencyInput = {
  /** From the authenticated session, never from the request body. */
  userId: string;
  name: string;
  slug?: string;
  timezone?: string;
  currency?: string;
};

export async function createAgency(db: Db, input: CreateAgencyInput, hostCfg: Pick<HostConfig, "rootDomain">) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new DomainError("invalid_input", "Agency name must be 2-80 characters.");
  const slug = (input.slug ?? slugify(name)).trim().toLowerCase();
  const slugError = validateSlug(slug);
  if (slugError) throw new DomainError("invalid_slug", slugError);
  const currency = (input.currency ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new DomainError("invalid_input", "Invalid currency code.");

  const hostname = subdomainHost(slug, hostCfg);
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: agencies.id }).from(agencies).where(eq(agencies.slug, slug));
    if (taken) throw new DomainError("slug_taken", "That address is already taken.");

    const [agency] = await tx
      .insert(agencies)
      .values({ name, slug, timezone: input.timezone ?? "UTC", currency })
      .returning();
    await tx.insert(agencyDomains).values({
      agencyId: agency!.id,
      hostname,
      kind: "subdomain",
      verificationToken: randomBytes(24).toString("hex"),
      status: "active",
      isPrimary: true,
      verifiedAt: new Date(),
      createdBy: input.userId,
    });
    for (const r of SYSTEM_ROLES) await systemRoleId(tx, r.key); // make sure every system role exists
    const ownerRole = await systemRoleId(tx, "agency_owner");
    await tx.insert(memberships).values({
      userId: input.userId,
      agencyId: agency!.id,
      roleId: ownerRole,
      clientAccess: "all",
    });
    return { ...agency!, hostname };
  });
}

export async function isSlugAvailable(db: Db, slug: string) {
  if (validateSlug(slug)) return false;
  const [row] = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.slug, slug));
  return !row;
}

/** Agency-level memberships for a user, optionally limited to one agency (the host's). */
export async function listAgencyMemberships(db: Db, userId: string, onlyAgencyId?: string) {
  const rows = await db
    .select({
      agencyId: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      role: roles.key,
      hostname: agencyDomains.hostname,
    })
    .from(memberships)
    .innerJoin(agencies, eq(agencies.id, memberships.agencyId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .leftJoin(agencyDomains, and(eq(agencyDomains.agencyId, agencies.id), eq(agencyDomains.isPrimary, true)))
    .where(and(eq(memberships.userId, userId), isNull(memberships.clientId)));
  return onlyAgencyId ? rows.filter((r) => r.agencyId === onlyAgencyId) : rows;
}
