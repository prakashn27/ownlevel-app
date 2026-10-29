import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  agencies,
  agencyDomains,
  clients,
  createAgency,
  createClient,
  createInvitation,
  getTeam,
  listClients,
  updateClient,
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

describe("client-level scoping", () => {
  let c1: string;
  let c2: string;
  const uC = `rls-c-${run}`;

  before(async () => {
    await db.insert(user).values({ id: uC, name: uC, email: `${uC}@test.local` });
    c1 = (await createClient(db, { userId: uA, agencyId: A.id }, { name: "C1" })).id;
    c2 = (await createClient(db, { userId: uA, agencyId: A.id }, { name: "C2" })).id;
    await createInvitation(db, { userId: uA, agencyId: A.id }, { email: `c1-${run}@test.local`, roleKey: "client_user", clientId: c1 });
    await createInvitation(db, { userId: uA, agencyId: A.id }, { email: `c2-${run}@test.local`, roleKey: "client_user", clientId: c2 });
    await createInvitation(db, { userId: uA, agencyId: A.id }, { email: `agency-${run}@test.local`, roleKey: "agency_user" });
    const [role] = await db.select().from(roles).where(sql`agency_id is null and key = 'client_user'`);
    for (const clientId of [c1, c2])
      await withTenant(db, { agencyId: A.id }, (tx) => tx.insert(memberships).values({ userId: uC, agencyId: A.id, clientId, roleId: role!.id }));
  });

  after(async () => {
    await db.execute(sql`delete from "user" where id = ${uC}`);
  });

  it("client context sees only that client's invitations and memberships", async () => {
    await withTenant(db, { agencyId: A.id, clientId: c1 }, async (tx) => {
      const inv = await tx.select().from(invitations);
      assert.deepEqual(inv.map((i) => i.email), [`c1-${run}@test.local`]);
      assert.ok((await tx.select().from(memberships)).every((m) => m.clientId === c1));
    });
  });

  it("agency context still sees every client's rows", async () => {
    await withTenant(db, { agencyId: A.id }, async (tx) => {
      assert.equal((await tx.select().from(invitations)).length, 3);
      assert.ok((await tx.select().from(memberships)).some((m) => m.clientId === c2));
    });
  });

  it("client context cannot write rows for another client or the agency level", async () => {
    const [role] = await db.select().from(roles).where(sql`agency_id is null and key = 'client_user'`);
    const row = { agencyId: A.id, roleId: role!.id, tokenHash: `h-${randomUUID()}`, invitedBy: uA, expiresAt: new Date(Date.now() + 1e6) };
    await assert.rejects(
      withTenant(db, { agencyId: A.id, clientId: c1 }, (tx) => tx.insert(invitations).values({ ...row, email: "x@test.local", clientId: c2 })),
      denied,
    );
    await assert.rejects(
      withTenant(db, { agencyId: A.id, clientId: c1 }, (tx) => tx.insert(invitations).values({ ...row, email: "y@test.local", tokenHash: `h-${randomUUID()}` })),
      denied,
    );
  });

  it("a person still sees their own memberships across clients", async () => {
    await withTenant(db, { userId: uC }, async (tx) => assert.equal((await tx.select().from(memberships)).length, 2));
  });

  it("team listing is split between agency and client", async () => {
    const ctx = { userId: uA, agencyId: A.id };
    assert.deepEqual((await getTeam(db, ctx, c1)).pending.map((p) => p.email), [`c1-${run}@test.local`]);
    assert.deepEqual((await getTeam(db, ctx)).pending.map((p) => p.email), [`agency-${run}@test.local`]);
    assert.equal((await getTeam(db, ctx, c1)).members.length, 1);
  });

  it("other agencies cannot see or invite into this client", async () => {
    const ctxB = { userId: uB, agencyId: B.id };
    await assert.rejects(getTeam(db, ctxB, c1), { code: "not_found" });
    await assert.rejects(createInvitation(db, ctxB, { email: "z@test.local", roleKey: "client_user", clientId: c1 }), { code: "not_found" });
    assert.deepEqual((await listClients(db, ctxB)).map((c) => c.name), ["B client"]);
  });

  it("client roles are only valid on client invites and vice versa", async () => {
    const ctx = { userId: uA, agencyId: A.id };
    await assert.rejects(createInvitation(db, ctx, { email: "q@test.local", roleKey: "agency_user", clientId: c1 }), { code: "invalid_input" });
    await assert.rejects(createInvitation(db, ctx, { email: "q@test.local", roleKey: "client_user" }), { code: "invalid_input" });
  });

  it("only owners and admins create clients; input is validated", async () => {
    await assert.rejects(createClient(db, { userId: uC, agencyId: A.id }, { name: "nope" }), { code: "forbidden" });
    await assert.rejects(createClient(db, { userId: uA, agencyId: A.id }, { name: "  " }), { code: "invalid_input" });
    await assert.rejects(createClient(db, { userId: uA, agencyId: A.id }, { name: "x", timezone: "Mars/Base" }), { code: "invalid_input" });
    await assert.rejects(createClient(db, { userId: uA, agencyId: A.id }, { name: "x", currency: "dollars" }), { code: "invalid_input" });
    await assert.rejects(getTeam(db, { userId: uA, agencyId: A.id }, "not-a-uuid"), { code: "not_found" });
  });

  it("clients can be edited and archived; archived clients take no invites", async () => {
    const ctx = { userId: uA, agencyId: A.id };
    const c = await createClient(db, ctx, { name: "Edit me" });
    assert.equal(c.timezone, "UTC"); // agency default
    const u = await updateClient(db, ctx, c.id, { name: "Edited", timezone: "Europe/Berlin", currency: "eur" });
    assert.deepEqual([u.name, u.timezone, u.currency], ["Edited", "Europe/Berlin", "EUR"]);
    await updateClient(db, ctx, c.id, { status: "archived" });
    await assert.rejects(createInvitation(db, ctx, { email: "arch@test.local", roleKey: "client_user", clientId: c.id }), { code: "invalid_input" });
    await assert.rejects(updateClient(db, ctx, c.id, { status: "deleted" }), { code: "invalid_input" });
    await assert.rejects(updateClient(db, { userId: uC, agencyId: A.id }, c.id, { name: "x" }), { code: "forbidden" });
    await assert.rejects(updateClient(db, { userId: uB, agencyId: B.id }, c.id, { name: "x" }), { code: "not_found" });
  });
});
