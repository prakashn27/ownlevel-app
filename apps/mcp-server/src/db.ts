import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema, type Db } from "@ownlevel/core";

const make = (connectionString: string, max?: number) => {
  const pool = new Pool({ connectionString, max });
  return { pool, db: drizzle(pool, { schema }) as Db };
};

// Node (local dev): one long-lived pool, created on first use.
let shared: ReturnType<typeof make> | undefined;
const nodeDb = () => (shared ??= make(process.env.DATABASE_URL ?? "postgres://ownlevel:ownlevel@localhost:5432/ownlevel"));

// Workers: I/O objects can't outlive the request that created them, so each request gets its own pool
// (Hyperdrive does the real pooling) and `db` resolves to it via AsyncLocalStorage. Same pattern as apps/api.
const requestDb = new AsyncLocalStorage<Db>();

export async function runWithDb<T>(connectionString: string, fn: () => Promise<T>, waitUntil: (p: Promise<unknown>) => void): Promise<T> {
  const { pool, db } = make(connectionString, 5);
  try {
    return await requestDb.run(db, fn);
  } finally {
    waitUntil(pool.end().catch(() => {}));
  }
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const target = requestDb.getStore() ?? nodeDb().db;
    const v = Reflect.get(target, prop, target);
    return typeof v === "function" ? v.bind(target) : v;
  },
});
