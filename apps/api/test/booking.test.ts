import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  addHost,
  backfillAttendeeContacts,
  bookPublic,
  cancelManagedBooking,
  createAgency,
  createAppointment,
  createCalendar,
  createClient,
  createField,
  createRecord,
  deleteRecord,
  getBookingSettings,
  getManagedBooking,
  getPublicCalendar,
  getPublicSlots,
  listContactAppointments,
  listRecords,
  memberships,
  parsePhone,
  roles,
  updateBookingSettings,
  updateCalendar,
  updateField,
  user,
  withTenant,
} from "@ownlevel/core";
import { db, pool } from "../src/db/index.js";

const cfg = { rootDomain: "localhost", platformHosts: ["localhost"] };
const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;
const reason = (r: string) => (e: unknown) => (e as { details?: { reason?: string } }).details?.reason === r;
const run = randomUUID().slice(0, 8);
const U = Object.fromEntries(["owner", "agencyUser", "clientAdmin", "host1", "host2", "other"].map((k) => [k, `bk-${k}-${run}`])) as Record<string, string>;
let A: { id: string };
let B: { id: string };
let c1: string;
let c2: string;
const slug1 = `acme-${run}`;
const as = (userId: string, clientId = c1) => ({ userId, agencyId: A.id, clientId });
const owner = () => as(U.owner!);

// A Monday at least 3 days out, so notice and horizon never interfere.
const monday = new Date();
monday.setUTCHours(0, 0, 0, 0);
monday.setUTCDate(monday.getUTCDate() + 3);
while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
const at = (hh: string, plusDays = 0) => new Date(monday.getTime() + plusDays * 86_400_000 + Number(hh.slice(0, 2)) * 3_600_000 + Number(hh.slice(3)) * 60_000).toISOString();
const win = (d: number) => ({ from: at("00:00", d), to: at("00:00", d + 1) });
const hours = { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [["09:00", "17:00"]], sun: [["09:00", "17:00"]] };

let seq = 0;
const mk = async (type: string, extra: Record<string, unknown> = {}, publish = true) => {
  const cal = await createCalendar(db, owner(), { type, name: `Bk ${++seq}`, slug: `bk-${run}-${seq}`, timezone: "UTC", weekly_hours: hours, max_days_ahead: 365, ...(type === "class" ? { capacity: 2 } : {}), ...extra });
  if (publish) await updateCalendar(db, owner(), cal.id, { status: "published" });
  return cal;
};
const book = (cal: { slug: string }, input: Record<string, unknown>, key?: string, slug = slug1) => bookPublic(db, A.id, slug, cal.slug, input, key);
const who = (n: string, over: Record<string, unknown> = {}) => ({ name: n, email: `${n.toLowerCase()}-${run}@test.local`, phone: `415555${String(Math.abs([...n].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 10000).padStart(4, "0")}`, ...over });
const contacts = () => withTenant(db, owner(), (tx) => tx.execute(sql`select id, emails_primary_email e, phones_primary_phone_number p, phones_primary_phone_calling_code cc, phones_primary_phone_country_code co, data from contacts where client_id = ${c1}`)).then((r) => r.rows as { id: string; e: string | null; p: string | null; cc: string | null; co: string | null; data: Record<string, unknown> }[]);
const attendeeContact = (token: string) => withTenant(db, owner(), (tx) => tx.execute(sql`select contact_id from appointment_attendees where id = ${token.split(".")[1]}`)).then((r) => (r.rows[0] as { contact_id: string | null }).contact_id);

before(async () => {
  for (const id of Object.values(U)) await db.insert(user).values({ id, name: id, email: `${id}@test.local` });
  A = await createAgency(db, { userId: U.owner!, name: `Bk A ${run}`, slug: `bk-a-${run}` }, cfg);
  B = await createAgency(db, { userId: U.other!, name: `Bk B ${run}`, slug: `bk-b-${run}` }, cfg);
  c1 = (await createClient(db, { userId: U.owner!, agencyId: A.id }, { name: "Acme" })).id;
  c2 = (await createClient(db, { userId: U.owner!, agencyId: A.id }, { name: "Beta" })).id;
  await updateBookingSettings(db, owner(), { slug: slug1 });
  const role = async (key: string) => (await db.select().from(roles).where(sql`agency_id is null and key = ${key}`))[0]!.id;
  await withTenant(db, { agencyId: A.id }, async (tx) => {
    await tx.insert(memberships).values({ userId: U.agencyUser!, agencyId: A.id, roleId: await role("agency_user"), clientAccess: "all" });
    await tx.insert(memberships).values({ userId: U.host1!, agencyId: A.id, roleId: await role("agency_user"), clientAccess: "all" });
    await tx.insert(memberships).values({ userId: U.clientAdmin!, agencyId: A.id, clientId: c1, roleId: await role("client_admin") });
    await tx.insert(memberships).values({ userId: U.host2!, agencyId: A.id, clientId: c1, roleId: await role("client_user") });
  });
});

after(async () => {
  for (const t of ["appointment_attendees", "appointment_hosts", "appointments", "calendar_date_overrides", "calendar_hosts", "calendars", "contacts", "crm_fields"]) await db.execute(sql.raw(`delete from ${t} where agency_id in ('${A.id}', '${B.id}')`));
  await db.execute(sql`delete from roles where agency_id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from agencies where id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from "user" where id like ${`bk-%-${run}`}`);
  await pool.end();
});

describe("phone numbers and the default country", () => {
  it("reads numbers in the default country, and keeps a typed country code", () => {
    assert.deepEqual(parsePhone("(415) 555-0123", "US"), { e164: "+14155550123", country: "US", calling: "+1" });
    assert.equal((parsePhone("020 7123 4567", "GB") as { e164: string }).e164, "+442071234567");
    assert.equal((parsePhone("+44 20 7123 4567", "US") as { e164: string }).e164, "+442071234567"); // typed code wins
    assert.ok("error" in parsePhone("123", "US"));
    assert.ok("error" in parsePhone("4155550123")); // no code and no default
  });

  it("falls back calendar → client → agency, and the agency always has one", async () => {
    const s = await getBookingSettings(db, owner());
    assert.equal(s.effective_country, "US"); // copied from the agency when the client was created
    await updateBookingSettings(db, owner(), { country: "GB" });
    const cal = await mk("personal", { host_ids: [U.host1], require_email: false });
    assert.equal((await getPublicCalendar(db, A.id, slug1, cal.slug)).default_country, "GB");
    await updateCalendar(db, owner(), cal.id, { default_country: "FR" });
    assert.equal((await getPublicCalendar(db, A.id, slug1, cal.slug)).default_country, "FR");
    const b = await book(cal, { starts_at: at("09:00", 20), attendee: { name: "Fr", phone: "01 23 45 67 89" } });
    assert.ok(b.manage_token);
    assert.ok((await contacts()).some((c) => c.p === "+33123456789" && c.cc === "+33" && c.co === "FR"));
    await updateBookingSettings(db, owner(), { country: null });
    await assert.rejects(createAgency(db, { userId: U.other!, name: "x", country: "ZZ" }, cfg), code("invalid_input"));
  });
});

describe("booking addresses", () => {
  it("are readable, unique per agency, set by owners, admins and client_admin", async () => {
    assert.equal((await getBookingSettings(db, owner())).slug, slug1);
    assert.equal((await createClient(db, { userId: U.owner!, agencyId: A.id }, { name: "Acme" })).id !== c1, true); // second "Acme" gets another suggestion
    await assert.rejects(updateBookingSettings(db, owner(), { slug: "manage" }), code("invalid_input"));
    await assert.rejects(updateBookingSettings(db, as(U.owner!, c2), { slug: slug1 }), code("slug_taken"));
    await assert.rejects(updateBookingSettings(db, as(U.agencyUser!), { slug: "nope-nope" }), code("forbidden"));
    assert.equal((await updateBookingSettings(db, as(U.clientAdmin!), { country: "US" })).country, "US");
    await updateBookingSettings(db, owner(), { country: null });
  });
});

describe("public booking page", () => {
  it("shows only published calendars of this agency, without host emails", async () => {
    const draft = await mk("personal", { host_ids: [U.host1] }, false);
    await assert.rejects(getPublicCalendar(db, A.id, slug1, draft.slug), code("not_found"));
    await assert.rejects(getPublicCalendar(db, B.id, slug1, draft.slug), code("not_found")); // another agency's host
    await updateCalendar(db, owner(), draft.id, { status: "published" });
    const page = await getPublicCalendar(db, A.id, slug1, draft.slug);
    assert.deepEqual(page.hosts, [{ name: U.host1 }]);
    assert.equal(page.require_phone, true);
    await updateCalendar(db, owner(), draft.id, { status: "archived" });
    await assert.rejects(getPublicCalendar(db, A.id, slug1, draft.slug), code("not_found"));
  });

  it("offers slots without host ids, and only a slot that is offered can be booked", async () => {
    const cal = await mk("personal", { host_ids: [U.host1], weekly_hours: { mon: [["09:00", "11:00"]] } });
    const slots = (await getPublicSlots(db, A.id, slug1, cal.slug, win(7))).slots;
    assert.deepEqual(slots.map((s) => s.start.slice(11, 16)), ["09:00", "09:30", "10:00", "10:30"]);
    assert.ok(!("hostIds" in slots[0]!));
    await assert.rejects(book(cal, { starts_at: at("14:00", 7), attendee: who("Late") }), reason("slot_taken")); // outside hours
    await assert.rejects(book(cal, { starts_at: at("09:10", 7), attendee: who("Odd") }), reason("slot_taken")); // not on the grid
    await book(cal, { starts_at: at("09:00", 7), attendee: who("Ann") });
    await assert.rejects(book(cal, { starts_at: at("09:00", 7), attendee: who("Bob") }), reason("slot_taken"));
    assert.ok(!(await getPublicSlots(db, A.id, slug1, cal.slug, win(7))).slots.some((s) => s.start === at("09:00", 7)));
    await assert.rejects(getPublicSlots(db, A.id, slug1, cal.slug, { from: at("00:00"), to: at("00:00", 60) }), code("invalid_input"));
  });

  it("rejects a missing required field, and honours relaxed requirements", async () => {
    const cal = await mk("personal", { host_ids: [U.host1] });
    await assert.rejects(book(cal, { starts_at: at("09:00", 8), attendee: { name: "N", email: `n-${run}@test.local` } }), /Phone is required/);
    await assert.rejects(book(cal, { starts_at: at("09:00", 8), attendee: { name: "N", phone: "4155550100" } }), /Email is required/);
    await assert.rejects(updateCalendar(db, owner(), cal.id, { require_email: false, require_phone: false }), code("invalid_input"));
    await updateCalendar(db, owner(), cal.id, { require_email: false });
    assert.ok((await book(cal, { starts_at: at("09:00", 8), attendee: { name: "N", phone: "4155550100" } })).manage_token);
    await assert.rejects(book(cal, { starts_at: at("09:30", 8), attendee: { name: "N", phone: "12" } }), /possible phone/);
  });

  it("checks answers against the form, drops unknown keys, and snapshots labels", async () => {
    const cal = await mk("personal", {
      host_ids: [U.host1],
      booking_form: [
        { label: "Reason", type: "select", required: true, options: ["Cleaning", "Check-up"] },
        { label: "Notes", type: "textarea", required: false },
        { label: "Insurance", type: "checkbox", required: true },
      ],
    });
    const base = { starts_at: at("09:00", 9), attendee: who("Form") };
    await assert.rejects(book(cal, { ...base, answers: { notes: "hi" } }), /Reason: this is required/);
    await assert.rejects(book(cal, { ...base, answers: { reason: "Other", insurance: true } }), /choose one/);
    await assert.rejects(book(cal, { ...base, answers: { reason: "Cleaning" } }), /Insurance: this is required/);
    const ok = await book(cal, { ...base, answers: { reason: "Cleaning", insurance: true, bogus: "x" } });
    const stored = await withTenant(db, owner(), (tx) => tx.execute(sql`select answers from appointment_attendees where id = ${ok.manage_token!.split(".")[1]}`));
    assert.deepEqual((stored.rows[0] as { answers: unknown[] }).answers, [
      { key: "reason", label: "Reason", type: "select", value: "Cleaning" },
      { key: "insurance", label: "Insurance", type: "checkbox", value: true },
    ]);
  });

  it("class: seats are shared, then full; round robin rotates; collective needs everyone", async () => {
    const cls = await mk("class", { host_ids: [U.host2] });
    const a = await book(cls, { starts_at: at("10:00", 10), attendee: who("C1") });
    const b = await book(cls, { starts_at: at("10:00", 10), attendee: who("C2") });
    assert.equal(a.booking.starts_at, b.booking.starts_at);
    await assert.rejects(book(cls, { starts_at: at("10:00", 10), attendee: who("C3") }), reason("slot_taken")); // full: no longer offered
    const seats = (await getPublicSlots(db, A.id, slug1, cls.slug, win(10))).slots.find((s) => s.start === at("10:30", 10));
    assert.equal((seats as { seats_left?: number }).seats_left, 2);

    const rr = await mk("round_robin", { host_ids: [U.host1, U.host2] });
    await book(rr, { starts_at: at("11:00", 10), attendee: who("R1") });
    await book(rr, { starts_at: at("11:00", 10), attendee: who("R2") });
    await assert.rejects(book(rr, { starts_at: at("11:00", 10), attendee: who("R3") }), reason("slot_taken"));

    const col = await mk("collective", { host_ids: [U.host1, U.host2] });
    await book(col, { starts_at: at("12:00", 10), attendee: who("K1") });
    await assert.rejects(book(col, { starts_at: at("12:00", 10), attendee: who("K2") }), reason("slot_taken"));
  });

  it("a repeated Idempotency-Key returns the first booking instead of booking twice", async () => {
    const cal = await mk("personal", { host_ids: [U.host1] });
    const input = { starts_at: at("09:00", 11), attendee: who("Idem") };
    const first = await book(cal, input, "key-12345678");
    const again = await book(cal, input, "key-12345678");
    assert.equal(first.replayed, false);
    assert.equal(again.replayed, true);
    assert.equal(again.manage_token, null);
    const n = await withTenant(db, owner(), (tx) => tx.execute(sql`select count(*)::int n from appointments where calendar_id = (select id from calendars where slug = ${cal.slug} and client_id = ${c1})`));
    assert.equal((n.rows[0] as { n: number }).n, 1);
    await assert.rejects(book(cal, input, "short"), code("invalid_input"));
  });

  it("the attendee can view and cancel their booking with the link, and only with it", async () => {
    const cal = await mk("personal", { host_ids: [U.host1] });
    const { manage_token: token } = await book(cal, { starts_at: at("09:00", 12), attendee: who("Mia") });
    const seen = await getManagedBooking(db, A.id, token!);
    assert.equal(seen.name, "Mia");
    assert.equal(seen.can_cancel, true);
    const [client, att, secret] = token!.split(".");
    await assert.rejects(getManagedBooking(db, A.id, `${client}.${att}.${secret}x`), code("not_found"));
    await assert.rejects(getManagedBooking(db, A.id, "garbage"), code("not_found"));
    await assert.rejects(getManagedBooking(db, B.id, token!), code("not_found")); // wrong agency host
    await cancelManagedBooking(db, A.id, token!);
    assert.equal((await getManagedBooking(db, A.id, token!)).status, "cancelled");
    await assert.rejects(cancelManagedBooking(db, A.id, token!), code("conflict"));
    // the host's time is free again
    assert.ok((await getPublicSlots(db, A.id, slug1, cal.slug, win(12))).slots.some((s) => s.start === at("09:00", 12)));
  });
});

describe("linking bookings to contacts: phone first, then email", () => {
  let cal: { slug: string; id: string };
  let day = 20;
  const next = () => ({ starts_at: at("10:00", day++) });
  before(async () => { cal = await mk("personal", { host_ids: [U.host1] }); await updateCalendar(db, owner(), cal.id, { require_email: false }); });

  it("creates a contact with the phone as E.164, then links later bookings by phone", async () => {
    const one = await book(cal, { ...next(), attendee: { name: "Ada Lovelace", email: `ada-${run}@test.local`, phone: "(415) 555-0111" } });
    const contactId = await attendeeContact(one.manage_token!);
    assert.ok(contactId);
    const row = (await contacts()).find((c) => c.id === contactId)!;
    assert.equal(row.p, "+14155550111");
    assert.equal(row.e, `ada-${run}@test.local`);
    // same phone, written differently and no email: same contact
    const two = await book(cal, { ...next(), attendee: { name: "A. Lovelace", phone: "415-555-0111" } });
    assert.equal(await attendeeContact(two.manage_token!), contactId);
    // same phone with a different, unknown email: still the phone's contact, and its email isn't replaced
    const three = await book(cal, { ...next(), attendee: { name: "Ada", phone: "+1 415 555 0111", email: `other-${run}@test.local` } });
    assert.equal(await attendeeContact(three.manage_token!), contactId);
    assert.equal((await contacts()).find((c) => c.id === contactId)!.e, `ada-${run}@test.local`);
  });

  it("falls back to email when the phone is new, without overwriting the contact's phone", async () => {
    const first = await book(cal, { ...next(), attendee: { name: "Bea", email: `bea-${run}@test.local`, phone: "415 555 0122" } });
    const id = await attendeeContact(first.manage_token!);
    await updateCalendar(db, owner(), cal.id, { require_phone: false, require_email: true });
    const second = await book(cal, { ...next(), attendee: { name: "Bea", email: `BEA-${run}@test.local` } }); // email only, case-insensitive
    assert.equal(await attendeeContact(second.manage_token!), id);
    await updateCalendar(db, owner(), cal.id, { require_phone: true, require_email: false });
    const third = await book(cal, { ...next(), attendee: { name: "Bea", email: `bea-${run}@test.local`, phone: "415 555 0199" } }); // new phone, known email
    assert.equal(await attendeeContact(third.manage_token!), id);
    assert.equal((await contacts()).find((c) => c.id === id)!.p, "+14155550122");
  });

  it("phone wins when phone and email point at different contacts", async () => {
    const p = await book(cal, { ...next(), attendee: { name: "Pia", email: `pia-${run}@test.local`, phone: "415 555 0133" } });
    const q = await book(cal, { ...next(), attendee: { name: "Quin", email: `quin-${run}@test.local`, phone: "415 555 0144" } });
    const pia = await attendeeContact(p.manage_token!);
    const quin = await attendeeContact(q.manage_token!);
    assert.notEqual(pia, quin);
    const r = await book(cal, { ...next(), attendee: { name: "Pia", email: `quin-${run}@test.local`, phone: "415 555 0133" } });
    assert.equal(await attendeeContact(r.manage_token!), pia);
  });

  it("several contacts on one phone: the email breaks the tie, otherwise a new contact is made", async () => {
    const mkContact = (n: string) => createRecord(db, owner(), "contacts", { fields: { name: { first_name: n }, emails: { primary_email: `${n}-${run}@test.local` }, phones: { primary_phone_number: "+14155550155" } } });
    const x = await mkContact("shared1");
    const y = await mkContact("shared2");
    const tied = await book(cal, { ...next(), attendee: { name: "S", email: `shared2-${run}@test.local`, phone: "415 555 0155" } });
    assert.equal(await attendeeContact(tied.manage_token!), y.id);
    const before = (await contacts()).length;
    const ambiguous = await book(cal, { ...next(), attendee: { name: "S", email: `new-${run}@test.local`, phone: "415 555 0155" } });
    const made = await attendeeContact(ambiguous.manage_token!);
    assert.ok(made && made !== x.id && made !== y.id);
    assert.equal((await contacts()).length, before + 1);
  });

  it("fills an empty email, but never one that belongs to another contact", async () => {
    const lone = await createRecord(db, owner(), "contacts", { fields: { name: { first_name: "Phoneonly" }, phones: { primary_phone_number: "+14155550166" } } });
    await book(cal, { ...next(), attendee: { name: "Phoneonly", email: `po-${run}@test.local`, phone: "415 555 0166" } });
    assert.equal((await contacts()).find((c) => c.id === lone.id)!.e, `po-${run}@test.local`);
    const lone2 = await createRecord(db, owner(), "contacts", { fields: { name: { first_name: "Phoneonly2" }, phones: { primary_phone_number: "+14155550167" } } });
    await book(cal, { ...next(), attendee: { name: "Phoneonly2", email: `po-${run}@test.local`, phone: "415 555 0167" } }); // email taken by the first
    assert.equal((await contacts()).find((c) => c.id === lone2.id)!.e, null);
  });

  it("two simultaneous bookings by one new person make one contact", async () => {
    const before = (await contacts()).length;
    const results = await Promise.all([0, 1, 2].map((i) => book(cal, { starts_at: at("14:00", 40 + i), attendee: { name: "Racer", email: `racer-${run}@test.local`, phone: "415 555 0177" } })));
    const ids = new Set(await Promise.all(results.map((r) => attendeeContact(r.manage_token!))));
    assert.equal(ids.size, 1);
    assert.equal((await contacts()).length, before + 1);
  });

  it("saves answers mapped to contact_input fields only", async () => {
    const f = await createField(db, owner(), "contacts", { label: "Company Size", type: "number" });
    const secret = await createField(db, owner(), "contacts", { label: "Internal Score", type: "number" });
    await updateField(db, owner(), "contacts", f.key, { contact_input: true });
    const withForm = await mk("personal", {
      host_ids: [U.host1],
      booking_form: [
        { label: "Company size", type: "number", required: false, contactFieldKey: f.key },
        { label: "Score", type: "number", required: false, contactFieldKey: secret.key },
      ],
    });
    const r = await book(withForm, { starts_at: at("09:00", 50), attendee: who("Mapped"), answers: { company_size: 42, score: 9 } });
    const c = (await contacts()).find((x) => x.id === (r as never as { id: string }).id) ?? (await contacts()).find((x) => x.e === `mapped-${run}@test.local`)!;
    assert.equal(c.data[f.key], 42);
    assert.ok(!(secret.key in c.data)); // not contact_input: never written
  });
});

describe("the contact's appointments and deletion", () => {
  it("shows one contact's bookings across calendars, staff and public, and erases details on delete", async () => {
    const a = await mk("personal", { host_ids: [U.host1] });
    const b = await mk("personal", { host_ids: [U.host2] });
    const pub = await book(a, { starts_at: at("09:00", 60), attendee: { name: "Zed", email: `zed-${run}@test.local`, phone: "415 555 0188" } });
    await createAppointment(db, owner(), { calendar_id: b.id, starts_at: at("09:00", 61), attendee: { name: "Zed", phone: "(415) 555-0188" } });
    const contactId = (await attendeeContact(pub.manage_token!))!;
    const list = (await listContactAppointments(db, owner(), contactId)).items;
    assert.equal(list.length, 2);
    assert.ok(list[0]!.starts_at > list[1]!.starts_at); // newest first
    assert.deepEqual(new Set(list.map((i) => i.calendar_id)), new Set([a.id, b.id]));
    assert.equal((await listContactAppointments(db, as(U.owner!, c2), contactId)).items.length, 0); // another client sees nothing

    await deleteRecord(db, owner(), "contacts", contactId);
    const after = await withTenant(db, owner(), (tx) => tx.execute(sql`select contact_id, attendee, answers, status from appointment_attendees where appointment_id in (${list[0]!.id}, ${list[1]!.id})`));
    for (const row of after.rows as { contact_id: string | null; attendee: { name: string; email?: string }; status: string }[]) {
      assert.equal(row.contact_id, null);
      assert.deepEqual(row.attendee, { name: "" }); // details gone, the booking and its status stay
      assert.equal(row.status, "booked");
    }
    assert.equal((await listRecords(db, owner(), "contacts", { q: "Zed" })).items.length, 0);
  });
});

describe("backfill", () => {
  it("links unlinked attendees to contacts, and is safe to re-run", async () => {
    const cal = await mk("personal", { host_ids: [U.host1] });
    const made = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("09:00", 70), attendee: { name: "Old Timer", email: `old-${run}@test.local`, phone: "415 555 0201" } });
    // As if it had been booked before contacts were linked.
    await withTenant(db, owner(), (tx) => tx.execute(sql`update appointment_attendees set contact_id = null where appointment_id = ${made.id}`));
    await withTenant(db, owner(), (tx) => tx.execute(sql`delete from contacts where client_id = ${c1} and emails_primary_email = ${`old-${run}@test.local`}`));
    const first = await backfillAttendeeContacts(db, { agencyId: A.id, clientId: c1 });
    assert.ok(first.linked >= 1);
    const row = await withTenant(db, owner(), (tx) => tx.execute(sql`select contact_id from appointment_attendees where appointment_id = ${made.id}`));
    assert.ok((row.rows[0] as { contact_id: string | null }).contact_id);
    assert.equal((await backfillAttendeeContacts(db, { agencyId: A.id, clientId: c1 })).linked, 0);
  });
});
