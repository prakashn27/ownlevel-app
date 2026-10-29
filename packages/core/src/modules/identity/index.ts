import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { slugify, subdomainHost, validateSlug, type HostConfig } from "@ownlevel/tenancy";
import { agencies, agencyDomains, memberships, roles, withTenant, type Db } from "../../db/index.js";
import { DomainError } from "../../errors.js";

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
  // The new agency's id is the tenant context, so every insert passes its own RLS check.
  const agencyId = randomUUID();
  try {
    return await withTenant(db, { agencyId, userId: input.userId }, async (tx) => {
      const [agency] = await tx
        .insert(agencies)
        .values({ id: agencyId, name, slug, timezone: input.timezone ?? "UTC", currency })
        .returning();
      await tx.insert(agencyDomains).values({
        agencyId,
        hostname,
        kind: "subdomain",
        verificationToken: randomBytes(24).toString("hex"),
        status: "active",
        isPrimary: true,
        verifiedAt: new Date(),
        createdBy: input.userId,
      });
      const [ownerRole] = await tx.select({ id: roles.id }).from(roles).where(and(isNull(roles.agencyId), eq(roles.key, "agency_owner")));
      if (!ownerRole) throw new Error("system roles are not seeded; run migrations");
      await tx.insert(memberships).values({ userId: input.userId, agencyId, roleId: ownerRole.id, clientAccess: "all" });
      return { ...agency!, hostname };
    });
  } catch (e) {
    // unique violation on agencies.slug or agency_domains.hostname
    if ((e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505")
      throw new DomainError("slug_taken", "That address is already taken.");
    throw e;
  }
}

export async function isSlugAvailable(db: Db, slug: string) {
  if (validateSlug(slug)) return false;
  return withTenant(db, { slug }, async (tx) => {
    const [row] = await tx.select({ id: agencies.id }).from(agencies).where(eq(agencies.slug, slug));
    return !row;
  });
}

/** Agency-level memberships for a user, optionally limited to one agency (the host's). */
export async function listAgencyMemberships(db: Db, userId: string, onlyAgencyId?: string) {
  const rows = await withTenant(db, { userId }, (tx) =>
    tx
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
      .where(and(eq(memberships.userId, userId), isNull(memberships.clientId))),
  );
  return onlyAgencyId ? rows.filter((r) => r.agencyId === onlyAgencyId) : rows;
}
