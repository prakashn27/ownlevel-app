import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  OBJECTS,
  contacts,
  createAgency,
  createClient,
  createField,
  createRecord,
  deleteField,
  deleteRecord,
  fieldUsage,
  getMetadata,
  getRecord,
  listRecords,
  memberships,
  registerDeleteHook,
  roles,
  updateField,
  updateRecord,
  user,
  validateInput,
  loadFields,
  withTenant,
} from "@ownlevel/core";
import { db, pool } from "../src/db/index.js";

const cfg = { rootDomain: "localhost", platformHosts: ["localhost"] };
const denied = (e: unknown) => /row-level security/.test((e as { cause?: Error }).cause?.message ?? String(e));
const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;
const run = randomUUID().slice(0, 8);
const uOwner = `crm-owner-${run}`;
const uAgencyUser = `crm-au-${run}`;
const uClientAdmin = `crm-ca-${run}`;
const uClientUser = `crm-cu-${run}`;
const uOutsider = `crm-out-${run}`;
const uOther = `crm-other-${run}`;
let A: { id: string };
let B: { id: string };
let c1: string;
let c2: string;
let bClient: string;
let owner: { userId: string; agencyId: string; clientId: string };
const as = (userId: string, clientId = c1) => ({ userId, agencyId: A.id, clientId });
const name = (first: string, last?: string) => ({ name: { first_name: first, last_name: last } });

before(async () => {
  for (const id of [uOwner, uAgencyUser, uClientAdmin, uClientUser, uOutsider, uOther]) await db.insert(user).values({ id, name: id, email: `${id}@test.local` });
  A = await createAgency(db, { userId: uOwner, name: `CRM A ${run}`, slug: `crm-a-${run}` }, cfg);
  B = await createAgency(db, { userId: uOther, name: `CRM B ${run}`, slug: `crm-b-${run}` }, cfg);
  c1 = (await createClient(db, { userId: uOwner, agencyId: A.id }, { name: "C1", currency: "EUR" })).id;
  c2 = (await createClient(db, { userId: uOwner, agencyId: A.id }, { name: "C2" })).id;
  bClient = (await createClient(db, { userId: uOther, agencyId: B.id }, { name: "B1" })).id;
  owner = as(uOwner);
  const role = async (key: string) => (await db.select().from(roles).where(sql`agency_id is null and key = ${key}`))[0]!.id;
  await withTenant(db, { agencyId: A.id }, async (tx) => {
    await tx.insert(memberships).values({ userId: uAgencyUser, agencyId: A.id, roleId: await role("agency_user"), clientAccess: "all" });
    await tx.insert(memberships).values({ userId: uClientAdmin, agencyId: A.id, clientId: c1, roleId: await role("client_admin") });
    await tx.insert(memberships).values({ userId: uClientUser, agencyId: A.id, clientId: c1, roleId: await role("client_user") });
  });
});

after(async () => {
  await db.execute(sql`delete from contacts where agency_id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from roles where agency_id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from agencies where id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from "user" where id like ${`crm-%-${run}`}`);
  await pool.end();
});

describe("contacts never leave the client (RLS)", () => {
  let id1: string;
  let id2: string;
  before(async () => {
    id1 = (await createRecord(db, owner, "contacts", { fields: name("Ada", "One") })).id;
    id2 = (await createRecord(db, as(uOwner, c2), "contacts", { fields: name("Bob", "Two") })).id;
  });

  it("agency context (no client) sees no contacts at all", async () => {
    await withTenant(db, { agencyId: A.id, userId: uOwner }, async (tx) => {
      assert.equal((await tx.select().from(contacts)).length, 0);
    });
  });

  it("no context sees nothing", async () => {
    await withTenant(db, {}, async (tx) => assert.equal((await tx.select().from(contacts)).length, 0));
  });

  it("client context sees only its own contacts", async () => {
    await withTenant(db, { agencyId: A.id, clientId: c1 }, async (tx) => assert.deepEqual((await tx.select().from(contacts)).map((r) => r.id), [id1]));
    await withTenant(db, { agencyId: A.id, clientId: c2 }, async (tx) => assert.deepEqual((await tx.select().from(contacts)).map((r) => r.id), [id2]));
  });

  it("another agency's client context sees nothing", async () => {
    await withTenant(db, { agencyId: B.id, clientId: c1 }, async (tx) => assert.equal((await tx.select().from(contacts)).length, 0));
  });

  it("cannot insert into another client or without a client", async () => {
    const row = { agencyId: A.id, createdBySource: "staff", nameFirstName: "x" };
    await assert.rejects(withTenant(db, { agencyId: A.id, clientId: c1 }, (tx) => tx.insert(contacts).values({ ...row, clientId: c2 })), denied);
    await assert.rejects(withTenant(db, { agencyId: A.id }, (tx) => tx.insert(contacts).values({ ...row, clientId: c1 })), denied);
  });

  it("cannot update or delete another client's contact", async () => {
    await withTenant(db, { agencyId: A.id, clientId: c1 }, async (tx) => {
      await tx.execute(sql`update contacts set name_first_name = 'hacked' where id = ${id2}`);
      await tx.execute(sql`delete from contacts where id = ${id2}`);
    });
    assert.equal((await getRecord(db, as(uOwner, c2), "contacts", id2)).fields.name && true, true);
    assert.equal(((await getRecord(db, as(uOwner, c2), "contacts", id2)).fields.name as { first_name: string }).first_name, "Bob");
  });

  it("the service never returns a contact through another client", async () => {
    await assert.rejects(getRecord(db, owner, "contacts", id2), code("not_found"));
    await assert.rejects(updateRecord(db, owner, "contacts", id2, { fields: { job_title: "x" } }), code("not_found"));
    await assert.rejects(deleteRecord(db, owner, "contacts", id2), code("not_found"));
  });

  it("another agency cannot reach the client at all", async () => {
    await assert.rejects(listRecords(db, { userId: uOther, agencyId: B.id, clientId: c1 }, "contacts"), code("not_found"));
    await assert.rejects(listRecords(db, { userId: uOther, agencyId: A.id, clientId: c1 }, "contacts"), code("not_found"));
  });
});

describe("permissions", () => {
  it("members of the client and agency staff can read and write", async () => {
    for (const u of [uOwner, uAgencyUser, uClientAdmin, uClientUser]) {
      const r = await createRecord(db, as(u), "contacts", { fields: { emails: { primary_email: `${u}@example.com` } } });
      assert.ok((await listRecords(db, as(u), "contacts")).items.some((x) => x.id === r.id));
    }
  });

  it("people outside the client get 404", async () => {
    await assert.rejects(listRecords(db, as(uOutsider), "contacts"), code("not_found"));
    await assert.rejects(listRecords(db, as(uClientUser, c2), "contacts"), code("not_found"));
  });

  it("only owners, admins and client admins delete or manage fields", async () => {
    const r = await createRecord(db, owner, "contacts", { fields: name("Del") });
    for (const u of [uAgencyUser, uClientUser]) {
      await assert.rejects(deleteRecord(db, as(u), "contacts", r.id), code("forbidden"));
      await assert.rejects(createField(db, as(u), "contacts", { label: "Nope", type: "text" }), code("forbidden"));
    }
    await deleteRecord(db, as(uClientAdmin), "contacts", r.id);
    await assert.rejects(getRecord(db, owner, "contacts", r.id), code("not_found"));
  });
});

describe("field metadata", () => {
  it("standard columns match the code definitions", async () => {
    const r = await db.execute(sql`select column_name from information_schema.columns where table_name = 'contacts'`);
    const cols = new Set(r.rows.map((x) => (x as { column_name: string }).column_name));
    const { SUBS } = await import("../../../packages/core/src/modules/crm/field-types.js");
    for (const f of OBJECTS.contacts!.fields) {
      if (f.type === "actor") continue;
      const subs = SUBS[f.type];
      for (const c of subs ? subs.map((s) => `${f.key}_${s.name}`) : [f.key]) assert.ok(cols.has(c), `missing column ${c}`);
    }
  });

  it("lists standard fields without system ones", async () => {
    const m = await getMetadata(db, owner, "contacts");
    assert.deepEqual(m.fields.map((f) => f.key), ["name", "emails", "phones", "job_title", "city", "linkedin"]);
  });

  it("standard fields can be relabelled, required and turned off, but not the name", async () => {
    const f = await updateField(db, owner, "contacts", "city", { label: "Town", required: false, contact_input: true });
    assert.equal(f.label, "Town");
    assert.equal(f.contact_input, true);
    await assert.rejects(updateField(db, owner, "contacts", "name", { active: false }), code("invalid_input"));
    await assert.rejects(updateField(db, owner, "contacts", "city", { type: "number" }), code("invalid_input"));
    await updateField(db, owner, "contacts", "emails", { active: false });
    await assert.rejects(updateField(db, owner, "contacts", "phones", { active: false }), /both/);
    await updateField(db, owner, "contacts", "emails", { active: true });
  });

  it("configuration is per client", async () => {
    const other = await getMetadata(db, as(uOwner, c2), "contacts");
    assert.equal(other.fields.find((f) => f.key === "city")!.label, "City");
  });

  it("custom fields get a key from the label, immutable and unique", async () => {
    const a = await createField(db, owner, "contacts", { label: "Company Size", type: "number" });
    assert.equal(a.key, "company_size");
    const b = await createField(db, owner, "contacts", { label: "Company Size", type: "text" });
    assert.equal(b.key, "company_size_2");
    await assert.rejects(createField(db, owner, "contacts", { label: "x", key: "emails", type: "text" }), code("conflict"));
    await assert.rejects(createField(db, owner, "contacts", { label: "x", key: "id", type: "text" }), code("conflict"));
    await assert.rejects(createField(db, owner, "contacts", { label: "x", key: "Bad Key", type: "text" }), code("invalid_input"));
    await assert.rejects(createField(db, owner, "contacts", { label: "x", type: "relation" }), code("invalid_input"));
    await assert.rejects(createField(db, owner, "contacts", { label: "x", type: "select" }), code("invalid_input"));
  });
});

describe("typed values", () => {
  let plan: string;
  let tags: string;
  before(async () => {
    await createField(db, owner, "contacts", { label: "Seats", key: "seats", type: "number", settings: { min: 1, max: 100 } });
    await createField(db, owner, "contacts", { label: "Newsletter", key: "newsletter", type: "boolean" });
    await createField(db, owner, "contacts", { label: "Birthday", key: "birthday", type: "date" });
    await createField(db, owner, "contacts", { label: "Last seen", key: "last_seen", type: "date_time" });
    await createField(db, owner, "contacts", { label: "Budget", key: "budget", type: "currency" });
    await createField(db, owner, "contacts", { label: "Rating", key: "score", type: "rating" });
    await createField(db, owner, "contacts", { label: "Home", key: "home", type: "address" });
    await createField(db, owner, "contacts", { label: "Notes", key: "bio", type: "rich_text" });
    await createField(db, owner, "contacts", { label: "Aliases", key: "aliases", type: "array" });
    await createField(db, owner, "contacts", { label: "Reference", key: "reference", type: "text", required: true, settings: { maxLength: 10 } });
    const p = await createField(db, owner, "contacts", { label: "Plan", key: "plan", type: "select", options: ["Free", "Pro", "Team"] });
    plan = p.key;
    const t = await createField(db, owner, "contacts", { label: "Tags", key: "tags", type: "multi_select", options: ["a", "b", "c"], settings: { maxSelected: 2 } });
    tags = t.key;
  });

  const create = (fields: Record<string, unknown>) => createRecord(db, owner, "contacts", { fields: { reference: "r1", ...fields } });
  const opt = async (key: string, label: string) => (await getMetadata(db, owner, "contacts")).fields.find((f) => f.key === key)!.options!.find((o) => o.label === label)!.id;

  it("stores and returns every type in canonical form", async () => {
    const proPlan = await opt(plan, "Pro");
    const r = await create({
      name: { first_name: " Ada ", last_name: "Lovelace" },
      emails: { primary_email: "ADA@Example.com", additional_emails: ["Ada2@example.com", "ada@example.com"] },
      phones: { primary_phone_number: "+1 (415) 555-0123", primary_phone_country_code: "us" },
      linkedin: { primary_link_url: "https://linkedin.com/in/ada" },
      job_title: "Analyst",
      seats: 5, newsletter: true, birthday: "1815-12-10", last_seen: "2026-01-02T03:04:05+02:00",
      budget: { amount_micros: 1_500_000 }, score: "RATING_4",
      home: { city: "London", lat: 51.5, lng: "-0.12" }, bio: "# hi", aliases: ["x", "y"],
      [plan]: proPlan, [tags]: [await opt(tags, "a"), await opt(tags, "b")],
    });
    const f = r.fields as Record<string, any>;
    assert.deepEqual(f.name, { first_name: "Ada", last_name: "Lovelace" });
    assert.deepEqual(f.emails, { primary_email: "ada@example.com", additional_emails: ["ada2@example.com"] });
    assert.equal(f.phones.primary_phone_number, "+14155550123");
    assert.equal(f.phones.primary_phone_country_code, "US");
    assert.equal(f.linkedin.primary_link_url, "https://linkedin.com/in/ada");
    assert.equal(f.seats, 5);
    assert.equal(f.birthday, "1815-12-10");
    assert.equal(f.last_seen, "2026-01-02T01:04:05.000Z");
    assert.deepEqual(f.budget, { amount_micros: 1_500_000, currency_code: "EUR" });
    assert.deepEqual(f.home, { street1: null, street2: null, city: "London", postcode: null, state: null, country: null, lat: 51.5, lng: -0.12 });
    assert.deepEqual(f.bio, { markdown: "# hi" });
    assert.equal(f[plan], proPlan);
    assert.equal(r.created_by.source, "staff");
    assert.equal(r.created_by.user_id, uOwner);
    assert.deepEqual(await getRecord(db, owner, "contacts", r.id), r);
  });

  it("rejects bad values naming the field", async () => {
    const bads: [Record<string, unknown>, RegExp][] = [
      [{ seats: 0 }, /Seats.*at least 1/],
      [{ seats: 1.5 }, /whole number/],
      [{ seats: "abc" }, /number/],
      [{ newsletter: "yes" }, /true or false/],
      [{ birthday: "2026-02-30" }, /date/],
      [{ last_seen: "soon" }, /date and time/],
      [{ score: "RATING_9" }, /RATING/],
      [{ budget: { amount_micros: 1.5 } }, /whole number/],
      [{ emails: { primary_email: "nope" } }, /valid email/],
      [{ emails: { additional_emails: ["a@b.co"] } }, /primary_email/],
      [{ phones: { primary_phone_number: "4155550123" } }, /country code/],
      [{ linkedin: { primary_link_url: "javascript:alert(1)" } }, /http/],
      [{ [plan]: "opt_nope" }, /options/],
      [{ reference: "x".repeat(11) }, /at most 10/],
      [{ nope: 1 }, /Unknown field "nope"/],
      [{ avatar_url: "x" }, /Unknown field/],
    ];
    for (const [fields, re] of bads) await assert.rejects(create(fields), (e: Error) => code("invalid_input")(e) && re.test(e.message), JSON.stringify(fields));
    await assert.rejects(create({ [tags]: [await opt(tags, "a"), await opt(tags, "b"), await opt(tags, "c")] }), /at most 2/);
  });

  it("enforces required fields and at least one identifier", async () => {
    await assert.rejects(createRecord(db, owner, "contacts", { fields: name("NoRef") }), /Reference.*required/);
    await assert.rejects(create({ job_title: "only a title" }), /name, an email or a phone/);
    const ok = await create({ name: { first_name: "Req" } });
    await assert.rejects(updateRecord(db, owner, "contacts", ok.id, { fields: { reference: null } }), /required/);
    await assert.rejects(updateRecord(db, owner, "contacts", ok.id, { fields: { name: null } }), /name, an email or a phone/);
  });

  it("partial updates merge; null clears; composites are replaced whole", async () => {
    const r = await create({ name: { first_name: "Merge" }, job_title: "A", city: "X", seats: 3 });
    const u = await updateRecord(db, owner, "contacts", r.id, { fields: { job_title: null, seats: 4, name: { first_name: "Merged", last_name: "Z" } } });
    assert.equal(u.fields.job_title, undefined);
    assert.equal(u.fields.city, "X");
    assert.equal(u.fields.seats, 4);
    assert.deepEqual(u.fields.name, { first_name: "Merged", last_name: "Z" });
    const v = await updateRecord(db, owner, "contacts", r.id, { fields: { name: { first_name: "Only" } } });
    assert.deepEqual(v.fields.name, { first_name: "Only", last_name: null });
    assert.ok(v.updated_at >= r.updated_at);
  });

  it("emails are unique per client, and the conflict names the existing contact", async () => {
    const first = await create({ emails: { primary_email: "dupe@example.com" } });
    await assert.rejects(create({ emails: { primary_email: "DUPE@example.com" } }), (e: any) => code("conflict")(e) && e.details.id === first.id);
    const other = await create({ name: { first_name: "Other" } });
    await assert.rejects(updateRecord(db, owner, "contacts", other.id, { fields: { emails: { primary_email: "dupe@example.com" } } }), code("conflict"));
    await updateRecord(db, owner, "contacts", first.id, { fields: { emails: { primary_email: "dupe@example.com" } } }); // own email is fine
    // the same email in another client is a different contact
    await createRecord(db, as(uOwner, c2), "contacts", { fields: { emails: { primary_email: "dupe@example.com" } } });
  });

  it("inactive fields keep their values but are hidden and read-only", async () => {
    const r = await create({ name: { first_name: "Hide" }, seats: 7 });
    await updateField(db, owner, "contacts", "seats", { active: false });
    assert.equal((await getRecord(db, owner, "contacts", r.id)).fields.seats, undefined);
    await assert.rejects(updateRecord(db, owner, "contacts", r.id, { fields: { seats: 8 } }), /Unknown field "seats"/);
    await updateField(db, owner, "contacts", "seats", { active: true });
    assert.equal((await getRecord(db, owner, "contacts", r.id)).fields.seats, 7);
  });

  it("contact mode only accepts contact_input fields and drops the rest", async () => {
    const fields = await withTenant(db, owner, (tx) => loadFields(tx, c1, OBJECTS.contacts!));
    const out = validateInput(fields, { name: { first_name: "Sam" }, job_title: "CEO", city: "Paris", reference: "r" }, "contact", true);
    assert.deepEqual([...out.keys()], ["city"]); // city was marked contact_input above
    assert.throws(() => validateInput(fields, { nope: 1 }, "staff", false), code("invalid_input"));
  });
});

describe("custom field changes", () => {
  it("deleting an option clears it from records; deleting a field removes its values", async () => {
    const f = await createField(db, owner, "contacts", { label: "Tier", key: "tier", type: "select", options: ["Gold", "Silver"] });
    const m = await createField(db, owner, "contacts", { label: "Interests", key: "interests", type: "multi_select", options: ["x", "y"] });
    const [gold, silver] = f.options!;
    const [x, y] = m.options!;
    const a = await createRecord(db, owner, "contacts", { fields: { name: { first_name: "T1" }, reference: "r", tier: gold!.id, interests: [x!.id, y!.id] } });
    const b = await createRecord(db, owner, "contacts", { fields: { name: { first_name: "T2" }, reference: "r", tier: silver!.id, interests: [x!.id] } });
    await updateField(db, owner, "contacts", "tier", { options: [{ id: silver!.id, label: "Silver+" }] });
    await updateField(db, owner, "contacts", "interests", { options: [{ id: y!.id, label: "y" }] });
    const ra = await getRecord(db, owner, "contacts", a.id);
    const rb = await getRecord(db, owner, "contacts", b.id);
    assert.equal(ra.fields.tier, undefined);
    assert.equal(rb.fields.tier, silver!.id);
    assert.deepEqual(ra.fields.interests, [y!.id]);
    assert.equal(rb.fields.interests, undefined);

    assert.deepEqual(await fieldUsage(db, owner, "contacts", "tier"), { records: 1 });
    await deleteField(db, owner, "contacts", "tier");
    assert.equal((await getRecord(db, owner, "contacts", b.id)).fields.tier, undefined);
    assert.ok(!(await getMetadata(db, owner, "contacts")).fields.some((x) => x.key === "tier"));
    await assert.rejects(deleteField(db, owner, "contacts", "emails"), code("invalid_input"));
  });

  it("type changes: free when unused, safe conversions when used, refused otherwise", async () => {
    await createField(db, owner, "contacts", { label: "Memo", key: "memo", type: "text" });
    await createField(db, owner, "contacts", { label: "Spend", key: "spend", type: "number" });
    await createField(db, owner, "contacts", { label: "Pick", key: "pick", type: "select", options: ["a", "b"] });
    const r = await createRecord(db, owner, "contacts", { fields: { name: { first_name: "Conv" }, reference: "r", memo: "hello", spend: 12 } });
    await assert.rejects(updateField(db, owner, "contacts", "memo", { type: "number" }), /Create a new field/);
    await updateField(db, owner, "contacts", "memo", { type: "rich_text" });
    await updateField(db, owner, "contacts", "spend", { type: "currency" });
    const after = (await getRecord(db, owner, "contacts", r.id)).fields as Record<string, any>;
    assert.deepEqual(after.memo, { markdown: "hello" });
    assert.deepEqual(after.spend, { amount_micros: 12_000_000, currency_code: "EUR" });
    const picked = (await getMetadata(db, owner, "contacts")).fields.find((f) => f.key === "pick")!;
    await updateField(db, owner, "contacts", "pick", { type: "number" }); // unused: any change is fine
    assert.ok(picked);
  });
});

describe("listing", () => {
  let cx: string;
  before(async () => {
    cx = (await createClient(db, { userId: uOwner, agencyId: A.id }, { name: "Listing" })).id;
    const s = as(uOwner, cx);
    await createField(db, s, "contacts", { label: "Seats", key: "seats", type: "number" });
    await createField(db, s, "contacts", { label: "Tags", key: "tags", type: "multi_select", options: ["vip", "lead"] });
    await createField(db, s, "contacts", { label: "Joined", key: "joined", type: "date" });
    const tags = (await getMetadata(db, s, "contacts")).fields.find((f) => f.key === "tags")!.options!;
    const vip = tags[0]!.id;
    const lead = tags[1]!.id;
    const people: [string, string, string, number, string[], string][] = [
      ["Ada", "Lovelace", "ada@lists.test", 10, [vip], "2026-01-10"],
      ["Alan", "Turing", "alan@lists.test", 5, [lead], "2026-02-10"],
      ["Grace", "Hopper", "grace@lists.test", 20, [vip, lead], "2026-03-10"],
      ["Linus", "Torvalds", "linus@other.test", 1, [], "2026-04-10"],
    ];
    for (const [first, last, email, seats, t, joined] of people)
      await createRecord(db, s, "contacts", { fields: { name: { first_name: first, last_name: last }, emails: { primary_email: email }, seats, tags: t, joined } });
    await createRecord(db, s, "contacts", { fields: { phones: { primary_phone_number: "+442071234567" } } });
    (globalThis as any).__vip = vip;
    (globalThis as any).__lead = lead;
  });
  const s = () => as(uOwner, cx);
  const names = (r: Awaited<ReturnType<typeof listRecords>>) => r.items.map((i) => (i.fields.name as { first_name: string } | undefined)?.first_name ?? "-");

  it("searches names, emails and phones, partially and case-insensitively", async () => {
    assert.deepEqual(names(await listRecords(db, s(), "contacts", { q: "LOVEL" })), ["Ada"]);
    assert.deepEqual((names(await listRecords(db, s(), "contacts", { q: "lists.test" }))).sort(), ["Ada", "Alan", "Grace"]);
    assert.deepEqual(names(await listRecords(db, s(), "contacts", { q: "2071234" })), ["-"]);
    assert.deepEqual(names(await listRecords(db, s(), "contacts", { q: "100%" })), []);
  });

  it("search follows edits", async () => {
    const [ada] = (await listRecords(db, s(), "contacts", { q: "ada" })).items;
    await updateRecord(db, s(), "contacts", ada!.id, { fields: { name: { first_name: "Augusta", last_name: "King" } } });
    assert.deepEqual(names(await listRecords(db, s(), "contacts", { q: "lovel" })), []);
    assert.deepEqual(names(await listRecords(db, s(), "contacts", { q: "augusta" })), ["Augusta"]);
  });

  it("filters by type", async () => {
    const f = async (filter: { key: string; op: string; value?: unknown }[]) => names(await listRecords(db, s(), "contacts", { filter, sort: "seats:asc" }));
    assert.deepEqual(await f([{ key: "seats", op: "gt", value: 5 }]), ["Augusta", "Grace"]);
    assert.deepEqual(await f([{ key: "seats", op: "gte", value: 5 }, { key: "seats", op: "lt", value: 20 }]), ["Alan", "Augusta"]);
    assert.deepEqual(await f([{ key: "name", op: "contains", value: "tur" }]), ["Alan"]);
    assert.deepEqual(await f([{ key: "emails", op: "eq", value: "GRACE@lists.test" }]), ["Grace"]);
    assert.deepEqual(await f([{ key: "tags", op: "has_any", value: [(globalThis as any).__vip] }]), ["Augusta", "Grace"]);
    assert.deepEqual(await f([{ key: "tags", op: "has_all", value: [(globalThis as any).__vip, (globalThis as any).__lead] }]), ["Grace"]);
    assert.deepEqual(await f([{ key: "tags", op: "is_empty" }, { key: "emails", op: "is_not_empty" }]), ["Linus"]);
    assert.deepEqual(await f([{ key: "joined", op: "lt", value: "2026-03-01" }]), ["Alan", "Augusta"]);
    assert.deepEqual(await f([{ key: "emails", op: "is_empty" }]), ["-"]);
  });

  it("rejects unknown fields and operators", async () => {
    await assert.rejects(listRecords(db, s(), "contacts", { filter: [{ key: "nope", op: "eq", value: 1 }] }), code("invalid_input"));
    await assert.rejects(listRecords(db, s(), "contacts", { filter: [{ key: "seats", op: "contains", value: "1" }] }), code("invalid_input"));
    await assert.rejects(listRecords(db, s(), "contacts", { sort: "tags:asc" }), code("invalid_input"));
    await assert.rejects(listRecords(db, s(), "contacts", { sort: "seats:sideways" }), code("invalid_input"));
    await assert.rejects(listRecords(db, s(), "contacts", { cursor: "!!" }), code("invalid_input"));
  });

  it("sorts and paginates", async () => {
    const page1 = await listRecords(db, s(), "contacts", { sort: "seats:desc", limit: 2 });
    assert.deepEqual(names(page1), ["Grace", "Augusta"]);
    assert.ok(page1.next_cursor);
    const page2 = await listRecords(db, s(), "contacts", { sort: "seats:desc", limit: 2, cursor: page1.next_cursor! });
    assert.deepEqual(names(page2), ["Alan", "Linus"]);
    const page3 = await listRecords(db, s(), "contacts", { sort: "seats:desc", limit: 2, cursor: page2.next_cursor! });
    assert.deepEqual(names(page3), ["-"]);
    assert.equal(page3.next_cursor, null);
  });
});

describe("delete", () => {
  it("erases the record immediately and runs registered hooks in the same transaction", async () => {
    const r = await createRecord(db, owner, "contacts", { fields: { name: { first_name: "Gone" }, reference: "r" } });
    const seen: string[] = [];
    registerDeleteHook(async (tx, t) => {
      seen.push(`${t.object}:${t.id}`);
      assert.equal((await tx.select().from(contacts).where(sql`id = ${t.id}`)).length, 1); // still there when hooks run
    });
    await deleteRecord(db, owner, "contacts", r.id);
    assert.deepEqual(seen, [`contact:${r.id}`]);
    const left = await db.execute(sql`select 1 from contacts where id = ${r.id}`);
    assert.equal(left.rows.length, 0);
  });

  it("a failing hook rolls the delete back", async () => {
    const r = await createRecord(db, owner, "contacts", { fields: { name: { first_name: "Stay" }, reference: "r" } });
    registerDeleteHook(async () => { throw new Error("boom"); });
    await assert.rejects(deleteRecord(db, owner, "contacts", r.id), /boom/);
    assert.equal((await getRecord(db, owner, "contacts", r.id)).id, r.id);
  });
});
