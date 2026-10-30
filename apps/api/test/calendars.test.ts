import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  addHost,
  appointments,
  archiveCalendar,
  calendars,
  clearOverride,
  createAgency,
  createAppointment,
  createCalendar,
  createClient,
  getCalendar,
  getSlots,
  listAppointments,
  listCalendars,
  listEligibleHosts,
  memberships,
  removeHost,
  roles,
  setOverride,
  updateAppointment,
  updateAttendee,
  updateCalendar,
  user,
  withTenant,
} from "@ownlevel/core";
import { db, pool } from "../src/db/index.js";

const cfg = { rootDomain: "localhost", platformHosts: ["localhost"] };
const denied = (e: unknown) => /row-level security/.test((e as { cause?: Error }).cause?.message ?? String(e));
const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;
const run = randomUUID().slice(0, 8);
const U = Object.fromEntries(["owner", "agencyUser", "clientAdmin", "clientUser", "otherClientUser", "outsider", "host1", "host2", "other"].map((k) => [k, `cal-${k}-${run}`])) as Record<string, string>;
let A: { id: string };
let B: { id: string };
let c1: string;
let c2: string;
const as = (userId: string, clientId = c1) => ({ userId, agencyId: A.id, clientId });
const owner = () => as(U.owner!);

// Next Monday, at least 3 days out, so the booking horizon and notice never interfere.
const monday = new Date();
monday.setUTCHours(0, 0, 0, 0);
monday.setUTCDate(monday.getUTCDate() + 3);
while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
const at = (hh: string, plusDays = 0) => new Date(monday.getTime() + plusDays * 86_400_000 + Number(hh.slice(0, 2)) * 3_600_000 + Number(hh.slice(3)) * 60_000).toISOString();
const week = { from: at("00:00"), to: at("00:00", 7) };
const person = (n: string) => ({ name: n, email: `${n.toLowerCase()}-${run}@test.local` });
let seq = 0;
const mk = (clientId: string, type: string, extra: Record<string, unknown> = {}) =>
  createCalendar(db, as(U.owner!, clientId), { type, name: `Cal ${++seq}`, timezone: "UTC", ...(type === "class" ? { capacity: 2 } : {}), ...extra });

before(async () => {
  for (const id of Object.values(U)) await db.insert(user).values({ id, name: id, email: `${id}@test.local` });
  A = await createAgency(db, { userId: U.owner!, name: `Cal A ${run}`, slug: `cal-a-${run}` }, cfg);
  B = await createAgency(db, { userId: U.other!, name: `Cal B ${run}`, slug: `cal-b-${run}` }, cfg);
  c1 = (await createClient(db, { userId: U.owner!, agencyId: A.id }, { name: "C1" })).id;
  c2 = (await createClient(db, { userId: U.owner!, agencyId: A.id }, { name: "C2" })).id;
  const role = async (key: string) => (await db.select().from(roles).where(sql`agency_id is null and key = ${key}`))[0]!.id;
  await withTenant(db, { agencyId: A.id }, async (tx) => {
    await tx.insert(memberships).values({ userId: U.agencyUser!, agencyId: A.id, roleId: await role("agency_user"), clientAccess: "all" });
    await tx.insert(memberships).values({ userId: U.host1!, agencyId: A.id, roleId: await role("agency_user"), clientAccess: "all" }); // works for both clients
    await tx.insert(memberships).values({ userId: U.clientAdmin!, agencyId: A.id, clientId: c1, roleId: await role("client_admin") });
    await tx.insert(memberships).values({ userId: U.clientUser!, agencyId: A.id, clientId: c1, roleId: await role("client_user") });
    await tx.insert(memberships).values({ userId: U.host2!, agencyId: A.id, clientId: c1, roleId: await role("client_user") });
    await tx.insert(memberships).values({ userId: U.otherClientUser!, agencyId: A.id, clientId: c2, roleId: await role("client_user") });
  });
});

after(async () => {
  for (const t of ["appointment_attendees", "appointment_hosts", "appointments", "calendar_date_overrides", "calendar_hosts", "calendars"]) await db.execute(sql.raw(`delete from ${t} where agency_id in ('${A.id}', '${B.id}')`));
  await db.execute(sql`delete from roles where agency_id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from agencies where id in (${A.id}, ${B.id})`);
  await db.execute(sql`delete from "user" where id like ${`cal-%-${run}`}`);
  await pool.end();
});

describe("isolation (RLS)", () => {
  let cal: { id: string };
  before(async () => {
    cal = await mk(c1, "personal", { host_ids: [U.host1] });
    await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("09:00"), attendee: person("Ada") });
  });

  it("agency context sees calendars across clients but never appointments", async () => {
    await mk(c2, "personal");
    await withTenant(db, { agencyId: A.id }, async (tx) => {
      assert.ok((await tx.select().from(calendars)).length >= 2);
      assert.equal((await tx.select().from(appointments)).length, 0);
    });
  });

  it("another client's context can't read or write this client's rows", async () => {
    await withTenant(db, { agencyId: A.id, clientId: c2 }, async (tx) => {
      assert.equal((await tx.select().from(appointments)).length, 0);
      assert.equal((await tx.select().from(calendars).where(sql`id = ${cal.id}`)).length, 0);
    });
    await assert.rejects(
      withTenant(db, { agencyId: A.id, clientId: c2 }, (tx) => tx.insert(appointments).values({ agencyId: A.id, clientId: c1, calendarId: cal.id, startsAt: new Date(), endsAt: new Date(Date.now() + 1000) })),
      denied,
    );
  });

  it("another agency can't reach them", async () => {
    await assert.rejects(listCalendars(db, { userId: U.other!, agencyId: B.id, clientId: c1 }), code("not_found"));
    await withTenant(db, { agencyId: B.id, clientId: c1 }, async (tx) => assert.equal((await tx.select().from(calendars)).length, 0));
  });

  it("calendars can't point at another client's appointments (composite FKs)", async () => {
    const other = await mk(c2, "personal");
    await assert.rejects(
      db.execute(sql`insert into appointments (agency_id, client_id, calendar_id, starts_at, ends_at) values (${A.id}, ${c1}, ${other.id}, now(), now() + interval '1 hour')`),
      (e: unknown) => /appointments_client_calendar_fk/.test((e as { cause?: Error }).cause?.message ?? ""),
    );
  });
});

describe("calendar permissions and rules", () => {
  it("only owners and admins create; client_admin edits hours; client_user only views", async () => {
    await assert.rejects(createCalendar(db, as(U.agencyUser!), { type: "personal", name: "Nope" }), code("forbidden"));
    await assert.rejects(createCalendar(db, as(U.clientAdmin!), { type: "personal", name: "Nope" }), code("forbidden"));
    const cal = await mk(c1, "personal");
    const hours = { mon: [["10:00", "12:00"]] };
    assert.deepEqual((await updateCalendar(db, as(U.clientAdmin!), cal.id, { weekly_hours: hours })).weekly_hours, hours);
    assert.deepEqual((await updateCalendar(db, as(U.agencyUser!), cal.id, { name: "Renamed" })).name, "Renamed");
    await assert.rejects(updateCalendar(db, as(U.clientUser!), cal.id, { name: "x" }), code("forbidden"));
    await assert.rejects(updateCalendar(db, as(U.clientAdmin!), cal.id, { status: "published" }), code("forbidden"));
    assert.ok((await listCalendars(db, as(U.clientUser!))).items.some((c) => c.id === cal.id));
    await assert.rejects(listCalendars(db, as(U.outsider!)), code("not_found"));
    await assert.rejects(listCalendars(db, as(U.otherClientUser!)), code("not_found")); // a member of another client
  });

  it("the type is fixed at creation; class needs a capacity; slugs are unique", async () => {
    const cal = await mk(c1, "personal");
    await assert.rejects(updateCalendar(db, owner(), cal.id, { type: "class" }), code("invalid_input"));
    await assert.rejects(createCalendar(db, owner(), { type: "class", name: "Yoga" }), code("invalid_input"));
    await assert.rejects(createCalendar(db, owner(), { type: "personal", name: "x", capacity: 3 }), code("invalid_input"));
    await createCalendar(db, owner(), { type: "personal", name: "Same", slug: `same-${run}` });
    await assert.rejects(createCalendar(db, owner(), { type: "personal", name: "Same", slug: `same-${run}` }), code("slug_taken"));
    const derived = [await createCalendar(db, owner(), { type: "personal", name: "Auto name" }), await createCalendar(db, owner(), { type: "personal", name: "Auto name" })];
    assert.notEqual(derived[0]!.slug, derived[1]!.slug);
    await assert.rejects(createCalendar(db, owner(), { type: "personal", name: "x", slug: "admin" }), code("invalid_input"));
  });

  it("validates hours and hosts, and enforces host counts per type", async () => {
    const cal = await mk(c1, "personal");
    await assert.rejects(updateCalendar(db, owner(), cal.id, { weekly_hours: { mon: [["12:00", "10:00"]] } }), code("invalid_input"));
    await assert.rejects(updateCalendar(db, owner(), cal.id, { weekly_hours: { mon: [["09:00", "12:00"], ["11:00", "13:00"]] } }), code("invalid_input"));
    await assert.rejects(addHost(db, owner(), cal.id, U.outsider!), code("invalid_input")); // not a member
    await assert.rejects(addHost(db, owner(), cal.id, U.otherClientUser!), code("invalid_input")); // member of a different client
    await assert.rejects(updateCalendar(db, owner(), cal.id, { status: "published" }), code("invalid_input")); // no host yet
    await addHost(db, owner(), cal.id, U.host1!);
    await assert.rejects(addHost(db, owner(), cal.id, U.host2!), code("conflict")); // personal = one host
    assert.equal((await updateCalendar(db, owner(), cal.id, { status: "published" })).status, "published");
    await assert.rejects(removeHost(db, owner(), cal.id, U.host1!), code("conflict")); // published needs its host
    const rr = await mk(c1, "round_robin", { host_ids: [U.host1] });
    await assert.rejects(updateCalendar(db, owner(), rr.id, { status: "published" }), code("invalid_input")); // needs two
    await addHost(db, owner(), rr.id, U.host2!);
    assert.equal((await updateCalendar(db, owner(), rr.id, { status: "published" })).status, "published");
    assert.equal((await archiveCalendar(db, owner(), rr.id)).status, "archived");
    assert.ok(!(await listCalendars(db, owner())).items.some((c) => c.id === rr.id));
  });

  it("date overrides are stored and cleared", async () => {
    const cal = await mk(c1, "personal");
    await setOverride(db, owner(), cal.id, "2031-12-25", { intervals: [] });
    await setOverride(db, owner(), cal.id, "2031-12-26", { intervals: [["10:00", "12:00"]] });
    assert.deepEqual((await getCalendar(db, owner(), cal.id)).overrides.map((o) => o.date), ["2031-12-25", "2031-12-26"]);
    await clearOverride(db, owner(), cal.id, "2031-12-25");
    assert.equal((await getCalendar(db, owner(), cal.id)).overrides.length, 1);
    await assert.rejects(setOverride(db, owner(), cal.id, "2031-02-31", { intervals: [] }), code("invalid_input"));
  });
});

describe("appointments", () => {
  it("personal: a host can't be double-booked; cancelling frees the time", async () => {
    const cal = await mk(c1, "personal", { host_ids: [U.host1], buffer_after_min: 10 });
    const first = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("09:00", 1), attendee: person("Ben") });
    assert.equal(first.hosts[0]!.user_id, U.host1);
    assert.equal(first.ends_at, at("09:30", 1));
    await assert.rejects(createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("09:15", 1), attendee: person("Cy") }), code("conflict"));
    await assert.rejects(createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("09:35", 1), attendee: person("Cy") }), code("conflict")); // inside the buffer
    await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("09:40", 1), attendee: person("Cy") });
    await updateAppointment(db, owner(), first.id, { status: "cancelled" });
    await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("09:00", 1), attendee: person("Di") });
    await assert.rejects(updateAppointment(db, owner(), first.id, { starts_at: at("11:00", 1) }), code("conflict")); // cancelled is final
  });

  it("a host is never double-booked across clients, and the other client sees only the busy time", async () => {
    const a = await mk(c1, "personal", { host_ids: [U.host1] });
    const b = await mk(c2, "personal", { host_ids: [U.host1] });
    await createAppointment(db, owner(), { calendar_id: a.id, starts_at: at("14:00", 2), attendee: person("Eve") });
    await assert.rejects(createAppointment(db, as(U.owner!, c2), { calendar_id: b.id, starts_at: at("14:00", 2), attendee: person("Fay") }), code("conflict"));
    const win = { from: at("00:00", 2), to: at("00:00", 3) };
    const slots = (await getSlots(db, as(U.owner!, c2), b.id, win)).slots.map((s) => s.start);
    assert.ok(slots.includes(at("13:30", 2)) && !slots.includes(at("14:00", 2)));
    assert.equal((await listAppointments(db, as(U.owner!, c2), { ...win })).items.length, 0); // no details leak
  });

  it("round robin rotates hosts and runs out when everyone is busy", async () => {
    const cal = await mk(c1, "round_robin", { host_ids: [U.host1, U.host2], weekly_hours: { mon: [["09:00", "17:00"]] } });
    const x = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("11:00", 7), attendee: person("G1") });
    const y = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("11:00", 7), attendee: person("G2") });
    assert.notEqual(x.hosts[0]!.user_id, y.hosts[0]!.user_id);
    await assert.rejects(createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("11:00", 7), attendee: person("G3") }), code("conflict"));
    const z = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("12:00", 7), attendee: person("G4") });
    assert.equal(z.hosts[0]!.user_id, x.hosts[0]!.user_id); // the one assigned longest ago
    const day = { from: at("00:00", 7), to: at("00:00", 8) };
    const s = (await getSlots(db, owner(), cal.id, day)).slots;
    assert.ok(!s.some((v) => v.start === at("11:00", 7)));
  });

  it("collective books every host", async () => {
    const cal = await mk(c1, "collective", { host_ids: [U.host1, U.host2] });
    const a = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("15:00", 3), attendee: person("Hal") });
    assert.equal(a.hosts.length, 2);
    await assert.rejects(createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("15:00", 3), attendee: person("Ida") }), code("conflict"));
  });

  it("class: attendees join one session until it is full; cancelling a seat reopens it", async () => {
    const cal = await mk(c1, "class", { host_ids: [U.host2] }); // capacity 2
    const a = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("16:00", 4), attendee: person("Jo") });
    const b = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("16:00", 4), attendee: person("Kit") });
    assert.equal(a.id, b.id);
    assert.equal(b.seats_taken, 2);
    await assert.rejects(createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("16:00", 4), attendee: person("Lu") }), code("conflict"));
    const seat = b.attendees[0]!;
    const after = await updateAttendee(db, owner(), a.id, seat.id, { status: "cancelled" });
    assert.equal(after.seats_taken, 1);
    assert.equal(after.status, "booked");
    await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("16:00", 4), attendee: person("Mo") });
    const all = (await listAppointments(db, owner(), { from: at("00:00", 4), to: at("00:00", 5) })).items.find((i) => i.id === a.id)!;
    for (const att of all.attendees.filter((x) => x.status === "booked")) await updateAttendee(db, owner(), a.id, att.id, { status: "cancelled" });
    assert.equal((await listAppointments(db, owner(), { from: at("00:00", 4), to: at("00:00", 5) })).items.find((i) => i.id === a.id)!.status, "cancelled");
    await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("16:00", 4), attendee: person("Ny") }); // a fresh session
  });

  it("simultaneous class bookings end up in one session without overbooking", async () => {
    const cal = await mk(c1, "class", { host_ids: [U.host2], capacity: 3 });
    const results = await Promise.allSettled(["a", "b", "c", "d", "e"].map((n) => createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("17:00", 5), attendee: person(`R${n}`) })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, 3);
    const items = (await listAppointments(db, owner(), { from: at("00:00", 5), to: at("00:00", 6), calendarId: cal.id })).items;
    assert.equal(items.length, 1);
    assert.equal(items[0]!.seats_taken, 3);
  });

  it("client_user: creates, and changes only their own", async () => {
    const cal = await mk(c1, "personal", { host_ids: [U.host1] });
    const mine = await createAppointment(db, as(U.clientUser!), { calendar_id: cal.id, starts_at: at("10:00", 8), attendee: person("Pam") });
    const staffs = await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("11:00", 8), attendee: person("Quin") });
    await assert.rejects(updateAppointment(db, as(U.clientUser!), staffs.id, { status: "cancelled" }), code("forbidden"));
    assert.equal((await updateAppointment(db, as(U.clientUser!), mine.id, { starts_at: at("10:30", 8) })).starts_at, at("10:30", 8));
    assert.equal((await updateAppointment(db, as(U.clientUser!), mine.id, { status: "cancelled" })).status, "cancelled");
    await assert.rejects(updateAppointment(db, as(U.outsider!), staffs.id, { status: "cancelled" }), code("not_found"));
    // client_user can see everything in the client, and a host can change appointments they host
    assert.ok((await listAppointments(db, as(U.clientUser!), { from: at("00:00", 8), to: at("00:00", 9) })).items.some((i) => i.id === staffs.id));
    const hosted = await createAppointment(db, owner(), { calendar_id: (await mk(c1, "personal", { host_ids: [U.host2] })).id, starts_at: at("10:00", 9), attendee: person("Rae") });
    assert.equal((await updateAppointment(db, as(U.host2!), hosted.id, { notes: "bring forms" })).notes, "bring forms");
  });

  it("lists a range with filters and pages", async () => {
    const cal = await mk(c1, "personal", { host_ids: [U.host1] });
    for (const h of ["09:00", "10:00", "11:00"]) await createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at(h, 10), attendee: person(`L${h}`) });
    const day = { from: at("00:00", 10), to: at("00:00", 11), calendarId: cal.id };
    const p1 = await listAppointments(db, owner(), { ...day, limit: 2 });
    assert.equal(p1.items.length, 2);
    assert.ok(p1.next_cursor);
    const p2 = await listAppointments(db, owner(), { ...day, limit: 2, cursor: p1.next_cursor! });
    assert.equal(p2.items.length, 1);
    assert.equal(p2.next_cursor, null);
    assert.equal((await listAppointments(db, owner(), { ...day, hostId: U.host2 })).items.length, 0);
    assert.equal((await listAppointments(db, owner(), { ...day, hostId: U.host1 })).items.length, 3);
    await assert.rejects(listAppointments(db, owner(), { from: at("00:00"), to: at("00:00", 100) }), code("invalid_input"));
    await assert.rejects(createAppointment(db, owner(), { calendar_id: cal.id, starts_at: at("12:00", 10), attendee: { name: "No contact" } }), code("invalid_input"));
  });
});

describe("eligible hosts", () => {
  it("lists this client's members and agency staff, not other clients' members", async () => {
    const ids = (await listEligibleHosts(db, as(U.clientAdmin!))).items.map((h) => h.user_id);
    assert.ok(ids.includes(U.host1!) && ids.includes(U.host2!) && ids.includes(U.owner!));
    assert.ok(!ids.includes(U.otherClientUser!) && !ids.includes(U.outsider!));
    await assert.rejects(listEligibleHosts(db, as(U.clientUser!)), code("forbidden"));
  });
});
