import { app } from "./app.js";
import { runWithDb } from "./db/index.js";

interface Bindings {
  /** Hyperdrive config pointing at the Postgres origin (connects as the non-owner app role). */
  HYPERDRIVE: { connectionString: string };
}

export default {
  fetch: (req: Request, bindings: Bindings, ctx: NonNullable<Parameters<typeof app.fetch>[2]>) =>
    runWithDb(bindings.HYPERDRIVE.connectionString, async () => app.fetch(req, bindings, ctx), (p) => ctx.waitUntil(p)),
};
