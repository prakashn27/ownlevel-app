import { handle } from "./app.js";
import { runWithDb } from "./db.js";

interface Env {
  /** Hyperdrive config pointing at Postgres (connects as the non-owner app role so RLS applies). */
  HYPERDRIVE: { connectionString: string };
}

export default {
  fetch: (req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) =>
    runWithDb(env.HYPERDRIVE.connectionString, () => handle(req), (p) => ctx.waitUntil(p)),
};
