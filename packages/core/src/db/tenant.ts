import { sql } from "drizzle-orm";
import type { Db } from "./index.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Per-transaction tenant context, read by the RLS policies through app_*() helpers.
 * - agencyId / clientId: the tenant the caller is acting in (from session or host, never the body)
 * - userId: lets a person read their own memberships across agencies
 * - host / slug: the narrow lookups used before a tenant is known (host resolution, slug check)
 */
export type TenantContext = {
  agencyId?: string;
  clientId?: string | null;
  userId?: string;
  host?: string;
  slug?: string;
};

/**
 * Runs `fn` in a transaction as the non-owner `app_user` role with the context set locally,
 * so PgBouncer or pool reuse can never leak it between requests.
 * Every query on a tenant table goes through here.
 */
export async function withTenant<T>(db: Db, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.agency_id', ${ctx.agencyId ?? ""}, true),
      set_config('app.client_id', ${ctx.clientId ?? ""}, true),
      set_config('app.user_id',   ${ctx.userId ?? ""}, true),
      set_config('app.host',      ${ctx.host ?? ""}, true),
      set_config('app.slug',      ${ctx.slug ?? ""}, true)`);
    await tx.execute(sql`set local role app_user`);
    return fn(tx);
  });
}
