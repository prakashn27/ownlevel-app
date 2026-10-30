import { handle } from "./app.js";
import { runWithDb } from "./db.js";

interface Env {
  /** Hyperdrive config pointing at Postgres (connects as the non-owner app role so RLS applies). */
  HYPERDRIVE: { connectionString: string };
  /** Workers rate-limit bindings of the public booking endpoint (see wrangler.jsonc). */
  AI_CLIENT_LIMITER?: Limiter;
  AI_BOOK_LIMITER?: Limiter;
}
type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };

export default {
  fetch: (req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) =>
    runWithDb(
      env.HYPERDRIVE.connectionString,
      () => handle(req, async (name, key) => (await (name === "client" ? env.AI_CLIENT_LIMITER : env.AI_BOOK_LIMITER)?.limit({ key }))?.success ?? true),
      (p) => ctx.waitUntil(p),
    ),
};
