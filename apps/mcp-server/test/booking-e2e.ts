/**
 * End-to-end check of the public booking MCP endpoint (/book/{agency}/{client}/mcp) against running servers
 * (API :4000, MCP :4100, Postgres). No sign-in on the endpoint itself; a throwaway agency, client, calendar and host
 * are created directly in the database and removed at the end.
 * Usage: pnpm --filter @ownlevel/mcp-server test:booking
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const MCP = (process.env.MCP_URL ?? "http://localhost:4100/mcp").replace(/\/mcp$/, "");
const run = Date.now();
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://ownlevel:ownlevel@localhost:5432/ownlevel" });
const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

// Setup: a user who hosts, an agency, two clients (a second one to prove tokens don't cross), published calendars.
const email = `book-${run}@e2e.test`;
let res = await fetch(`${API}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3100" }, body: JSON.stringify({ email, password: "password123", name: "Host E2E" }) });
const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
res = await fetch(`${API}/api/agencies`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3100", cookie }, body: JSON.stringify({ name: `Book ${run}`, slug: `e2e-book-${run}` }) });
const agency = (await res.json()) as { id: string };
const [{ id: hostId }] = await q('select id from "user" where email = $1', [email]);
const hours = JSON.stringify(Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["09:00", "17:00"]]])));
async function makeClient(slug: string, ai: boolean) {
  const [c] = await q("insert into clients (agency_id, name, slug, ai_booking, timezone) values ($1, $2, $3, $4, 'America/Toronto') returning id", [agency.id, `Salon ${slug}`, slug, ai]);
  return c.id as string;
}
async function makeCalendar(clientId: string, slug: string, status: string, ai: boolean) {
  const [c] = await q(
    `insert into calendars (agency_id, client_id, type, name, slug, status, ai_booking, timezone, weekly_hours, duration_min, slot_interval_min, min_notice_min)
     values ($1, $2, 'personal', $3, $3, $4, $5, 'America/Toronto', $6, 30, 30, 0) returning id`,
    [agency.id, clientId, slug, status, ai, hours],
  );
  await q("insert into calendar_hosts (calendar_id, user_id, agency_id, client_id) values ($1, $2, $3, $4)", [c.id, hostId, agency.id, clientId]);
  return c.id as string;
}
const salon = await makeClient("salon", false);
const other = await makeClient("other", true);
await makeCalendar(salon, "cut", "published", false);
await makeCalendar(salon, "colour", "published", true);
await makeCalendar(salon, "draft", "draft", true);
await makeCalendar(other, "cut", "published", true);

const url = (a: string, c: string) => `${MCP}/book/${a}/${c}/mcp`;
const rpc = (target: string, method: string, params?: unknown) =>
  fetch(target, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then(async (r) => ({ status: r.status, body: (await r.json().catch(() => null)) as any }));
const call = async (target: string, name: string, args: unknown = {}) => {
  const r = await rpc(target, "tools/call", { name, arguments: args });
  const text = r.body?.result?.content?.[0]?.text as string | undefined;
  let data: any = text;
  try { data = JSON.parse(text ?? ""); } catch {}
  return { status: r.status, isError: r.body?.result?.isError as boolean | undefined, data };
};

// A few days ahead, inside every calendar's booking horizon.
const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const U = url(`e2e-book-${run}`, "salon");
const OTHER = url(`e2e-book-${run}`, "other");

// 1. switches
let r = await rpc(U, "tools/list");
check("client switch off -> 404", r.status === 404, r);
check("unknown agency -> 404", (await rpc(url("nope-nope", "salon"), "tools/list")).status === 404);
await q("update clients set ai_booking = true where id = $1", [salon]);
r = await rpc(U, "tools/list");
const tools = (r.body?.result?.tools ?? []) as { name: string; annotations?: { readOnlyHint?: boolean } }[];
check("client switch on -> only the booking tools", tools.map((t) => t.name).sort().join() === "appointment_book,appointment_cancel,service_details,services_list,slots_find", tools.map((t) => t.name));
check("annotations: reads are read-only, book is not", tools.find((t) => t.name === "slots_find")?.annotations?.readOnlyHint === true && tools.find((t) => t.name === "appointment_book")?.annotations?.readOnlyHint === false, tools);

let s = await call(U, "services_list");
const offered = (s.data.services ?? []).map((x: any) => x.service);
check("only chosen, published calendars are offered", offered.join() === "colour", s.data);
s = await call(U, "slots_find", { service: "cut", date: day });
check("calendar with its switch off is not reachable", s.isError === true, s.data);
s = await call(U, "slots_find", { service: "draft", date: day });
check("draft calendar is not reachable", s.isError === true, s.data);

// 2. read
const d = await call(U, "service_details", { service: "colour" });
check("service_details says what is needed", d.data?.requires?.email_or_phone === true && Array.isArray(d.data?.questions), d.data);
s = await call(U, "slots_find", { service: "colour", date: day });
const slots = (s.data.slots ?? []) as { starts_at: string; local_start: string }[];
check("free slots in the calendar's local time", slots.length === 16 && slots[0]!.local_start === `${day} 09:00`, s.data);
s = await call(U, "slots_find", { service: "colour", date: "15/01/2030" });
check("bad date rejected", s.isError === true);

// 3. book
const person = { service: "colour", starts_at: slots[0]!.starts_at, name: "Ada Lovelace", email: `ada-${run}@e2e.test` };
let b = await call(U, "appointment_book", person);
check("booked, with a manage token", b.data?.booked === true && typeof b.data?.manage_token === "string", b);
const token = b.data?.manage_token as string;
const [row] = await q("select a.source, a.contact_id from appointment_attendees a where a.client_id = $1 and a.attendee->>'email' = $2", [salon, person.email]);
check("stored as source mcp and linked to a contact", row?.source === "mcp" && !!row.contact_id, row);
b = await call(U, "appointment_book", person);
const n1 = (await q("select count(*)::int n from appointment_attendees where client_id = $1 and attendee->>'email' = $2", [salon, person.email]))[0].n;
check("retrying the same booking does not book twice", b.data?.booked === true && n1 === 1, { b, n1 });
b = await call(U, "appointment_book", { ...person, name: "Someone Else", email: `else-${run}@e2e.test` });
check("a taken slot is refused", b.isError === true, b);
b = await call(U, "appointment_book", { ...person, starts_at: `${day}T03:00:00.000Z`, email: `x-${run}@e2e.test` });
check("a time that was not offered is refused", b.isError === true, b);
b = await call(U, "appointment_book", { service: "colour", starts_at: slots[1]!.starts_at, name: "No Contact" });
check("email or phone is required", b.isError === true, b);

// 4. cap per person
for (const i of [1, 2]) await call(U, "appointment_book", { ...person, starts_at: slots[1 + i]!.starts_at });
b = await call(U, "appointment_book", { ...person, starts_at: slots[5]!.starts_at });
check("a person's 4th upcoming booking is refused", b.isError === true && /upcoming/.test(String(b.data)), b);

// 5. cancel
b = await call(OTHER, "appointment_cancel", { manage_token: token });
check("a token of another client does not cancel here", b.isError === true, b);
b = await call(U, "appointment_cancel", { manage_token: "garbage" });
check("garbage token refused", b.isError === true, b);
b = await call(U, "appointment_cancel", { manage_token: token });
check("cancelled with the token", b.data?.ok === true, b);
s = await call(U, "slots_find", { service: "colour", date: day });
check("the freed slot is offered again", (s.data.slots ?? []).some((x: any) => x.starts_at === slots[0]!.starts_at), s.data);

// 6. turning it off again
await q("update clients set ai_booking = false where id = $1", [salon]);
check("master switch off -> 404 again", (await rpc(U, "tools/list")).status === 404);
check("another client with it on is unaffected", (await rpc(OTHER, "tools/list")).status === 200);

// cleanup
await q("delete from agencies where id = $1", [agency.id]);
await q('delete from "user" where email = $1', [email]);
await pool.end();
process.exit(failed ? 1 : 0);
