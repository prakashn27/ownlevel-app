import { and, eq } from "drizzle-orm";
import { parseHost, type HostConfig } from "@ownlevel/tenancy";
import { agencies, agencyDomains, withTenant, type Branding, type Db } from "../../db/index.js";

export type ResolvedHost =
  | { kind: "platform" }
  | { kind: "agency"; agencyId: string; name: string; slug: string; branding: Branding; hostname: string };

/** Host -> tenant. Only active domains resolve; unknown hosts return null (generic 404). */
export async function resolveHost(db: Db, rawHost: string, cfg: HostConfig): Promise<ResolvedHost | null> {
  const parsed = parseHost(rawHost, cfg);
  if (parsed.kind === "platform") return { kind: "platform" };
  // Narrow resolver context: RLS exposes only the active row for this exact hostname.
  const [row] = await withTenant(db, { host: parsed.host }, (tx) =>
    tx
    .select({
      agencyId: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      branding: agencies.branding,
      status: agencies.status,
    })
    .from(agencyDomains)
    .innerJoin(agencies, eq(agencies.id, agencyDomains.agencyId))
    .where(and(eq(agencyDomains.hostname, parsed.host), eq(agencyDomains.status, "active"))));
  if (!row || row.status !== "active") return null;
  return { kind: "agency", agencyId: row.agencyId, name: row.name, slug: row.slug, branding: row.branding, hostname: parsed.host };
}

/** True when the edge/auth layer may treat this origin host as ours (used for CSRF/origin checks). */
export async function isKnownHost(db: Db, rawHost: string, cfg: HostConfig) {
  return (await resolveHost(db, rawHost, cfg)) !== null;
}

