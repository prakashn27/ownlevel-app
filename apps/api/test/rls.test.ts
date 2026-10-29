import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  agencies,
  agencyDomains,
  clients,
  createAgency,
  invitations,
  isSlugAvailable,
  listAgencyMemberships,
  memberships,
  resolveHost,
  roles,
  usageEvents,
  user,
  withTenant,
} from "@ownlevel/core";
import { db, pool } from "../src/db/index.js";

const cfg = { rootDomain: "localhost", platformHosts: ["localhost"] };
// drizzle wraps the Postgres error; the RLS message lives on `cause`.
const denied = (e: unknown) => /row-level security/.test((e as { cause?: Error }).cause?.message ?? String(e));
const run = randomUUID().slice(0, 8);
let A: { id: string; hostname: string; slug: string };
let B: { id: string; hostname: string; slug: string };
const uA = `rls-a-${run}`;
const uB = `rls-b-${run}`;

before(async () => {
  for (const id of [uA, uB]) await db.insert(user).values({ id, name: id, email: `${id}@test.local` });
  A = await createAgency(db, { userId: uA, name: `RLS A ${run}`, slug: `rls-a-${run}` }, cfg);
  B = await createAgency(db, { userId: uB, name: `RLS B ${run}`, slug: `rls-b-${run}` }, cfg);
  await withTenant(db, { agencyId: A.id }, (tx) => tx.insert(clients).values({ agencyId: A.id, name: "A client" }));
  await withTenant(db, { agencyId: B.id }, (tx) => tx.insert(clients).values({ agencyId: B.id, name: "B client" }));
});

after(async () => {
  // Cleanup runs as the table owner, which is the only role allowed to bypass: test teardown, not app code.
  await db.execute(sql`delete from roles where agency_id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from usage_events where agency_id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from agencies where id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from "user" where id in (${uA}, ${uB})`);
  await pool.end();
});

describe("RLS on tenancy tables", () => {
  it("app_user with no context sees nothing", async () => {
    await withTenant(db, {}, async (tx) => {
      for (const t of [agencies, agencyDomains, clients, memberships, invitations, usageEvents]) {
        const rows = await tx.select().from(t);
        assert.equal(rows.length, 0);
      }
    });
  });

  it("agency context sees only its own rows", async () => {
    await withTenant(db, { agencyId: A.id }, async (tx) => {
      assert.deepEqual((await tx.select().from(agencies)).map((r) => r.id), [A.id]);
      assert.deepEqual((await tx.select().from(clients)).map((r) => r.name), ["A client"]);
      assert.ok((await tx.select().from(memberships)).every((m) => m.agencyId === A.id));
      assert.ok((await tx.select().from(agencyDomains)).every((d) => d.agencyId === A.id));
    });
  });

  it("cannot insert a row for another agency", async () => {
    await assert.rejects(
      withTenant(db, { agencyId: A.id }, (tx) => tx.insert(clients).values({ agencyId: B.id, name: "sneaky" })),
      denied,
    );
  });

  it("cannot update or delete another agency's rows (silently matches nothing)", async () => {
    await withTenant(db, { agencyId: A.id }, async (tx) => {
      const upd = await tx.update(clients).set({ name: "hacked" }).where(sql`agency_id = ${B.id}`).returning();
      const del = await tx.delete(clients).where(sql`agency_id = ${B.id}`).returning();
      assert.equal(upd.length + del.length, 0);
    });
    await withTenant(db, { agencyId: B.id }, async (tx) => {
      assert.deepEqual((await tx.select().from(clients)).map((r) => r.name), ["B client"]);
    });
  });

  it("cannot change the agency of an existing row to escape scope", async () => {
    await assert.rejects(
      withTenant(db, { agencyId: A.id }, (tx) => tx.update(clients).set({ agencyId: B.id }).where(sql`agency_id = ${A.id}`)),
      denied,
    );
  });

  it("client context sees only its own client row", async () => {
    const [c] = await withTenant(db, { agencyId: A.id }, (tx) => tx.select().from(clients));
    await withTenant(db, { agencyId: A.id, clientId: c!.id }, async (tx) => {
      assert.equal((await tx.select().from(clients)).length, 1);
    });
    await assert.rejects(
      withTenant(db, { agencyId: A.id, clientId: c!.id }, (tx) => tx.insert(clients).values({ agencyId: A.id, name: "x" })),
      denied,
    );
  });

  it("system roles are readable everywhere; custom roles are scoped", async () => {
    await withTenant(db, { agencyId: A.id }, async (tx) => {
      await tx.insert(roles).values({ agencyId: A.id, level: "agency", key: `custom-${run}`, name: "Custom" });
    });
    await withTenant(db, { agencyId: B.id }, async (tx) => {
      const keys = (await tx.select().from(roles)).map((r) => r.key);
      assert.ok(keys.includes("agency_owner"));
      assert.ok(!keys.includes(`custom-${run}`));
    });
    await assert.rejects(
      withTenant(db, { agencyId: A.id }, (tx) => tx.insert(roles).values({ level: "agency", key: `sys-${run}`, name: "sys" })),
      denied,
    );
  });

  it("usage ledger is scoped to the agency", async () => {
    await withTenant(db, { agencyId: A.id }, (tx) => tx.insert(usageEvents).values({ agencyId: A.id, meter: "email.sent", quantity: "1" }));
    await assert.rejects(
      withTenant(db, { agencyId: A.id }, (tx) => tx.insert(usageEvents).values({ agencyId: B.id, meter: "email.sent", quantity: "1" })),
      denied,
    );
    await withTenant(db, { agencyId: B.id }, async (tx) => assert.equal((await tx.select().from(usageEvents)).length, 0));
  });

  it("host resolver context reveals only the one active host", async () => {
    await withTenant(db, { host: A.hostname }, async (tx) => {
      assert.deepEqual((await tx.select().from(agencies)).map((r) => r.id), [A.id]);
      assert.equal((await tx.select().from(agencyDomains)).length, 1);
      assert.equal((await tx.select().from(clients)).length, 0);
      assert.equal((await tx.select().from(memberships)).length, 0);
    });
    assert.equal((await resolveHost(db, A.hostname, cfg))?.kind, "agency");
    assert.equal(await resolveHost(db, `nope-${run}.localhost`, cfg), null);
  });

  it("a person sees only their own memberships, across agencies", async () => {
    const mine = await listAgencyMemberships(db, uA);
    assert.deepEqual(mine.map((m) => m.agencyId), [A.id]);
    await withTenant(db, { userId: uA }, async (tx) => {
      assert.ok((await tx.select().from(memberships)).every((m) => m.userId === uA));
    });
  });

  it("slug lookup does not expose other agencies", async () => {
    assert.equal(await isSlugAvailable(db, A.slug), false);
    assert.equal(await isSlugAvailable(db, `free-${run}`), true);
    await withTenant(db, { slug: A.slug }, async (tx) => assert.equal((await tx.select().from(agencies)).length, 1));
  });

  it("slug collisions surface as slug_taken", async () => {
    await assert.rejects(createAgency(db, { userId: uB, name: "dup", slug: A.slug }, cfg), { code: "slug_taken" });
  });

  it("the app role cannot bypass RLS", async () => {
    await withTenant(db, {}, async (tx) => {
      const r = await tx.execute(sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
      assert.deepEqual(r.rows[0], { rolsuper: false, rolbypassrls: false });
    });
  });
});
