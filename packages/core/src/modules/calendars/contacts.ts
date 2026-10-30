import { eq, sql } from "drizzle-orm";
import { agencies, appointmentAttendees, clients, withTenant, type Db, type Tx } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { insertRecordTx, loadFields, parsePhone, patchRecordTx, registerDeleteHook, validateInput, type ParsedPhone } from "../crm/index.js";
import { objectDef } from "../crm/objects.js";
import { bad } from "./util.js";

type Scope = { agencyId: string; clientId: string };
type Row = Record<string, unknown>;

/**
 * Default country for phone numbers typed without a country code:
 * the calendar's, then the client's, then the agency's (always set).
 */
export async function defaultCountry(tx: Tx, clientId: string, calendarCountry?: string | null) {
  if (calendarCountry) return calendarCountry;
  const [c] = await tx.select({ client: clients.country, agency: agencies.country }).from(clients).innerJoin(agencies, eq(agencies.id, clients.agencyId)).where(eq(clients.id, clientId));
  return c?.client ?? c?.agency ?? "US";
}

/** Phone to E.164 in the default country; `picked` is the country the visitor chose in the selector. */
export function normalizePhone(raw: string, country: string): ParsedPhone {
  const p = parsePhone(raw, country);
  if ("error" in p) return bad(`Phone ${p.error}`);
  return p;
}

export type LinkInput = {
  name: string;
  email?: string;
  phone?: ParsedPhone;
  /** Booking form answers saved to contact fields, keyed by contact field key. Only `contact_input` fields are written. */
  mapped?: Record<string, unknown>;
  source: "booking" | "staff" | "mcp";
  actor: { userId: string | null; name: string | null };
};

const split = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return { first_name: first ?? null, last_name: rest.join(" ") || null };
};

/**
 * Finds or creates the contact for a booking, inside the booking's transaction. Phone is checked first, then email:
 *
 * | phone matches | email matches | result |
 * | one contact | same or none | that contact |
 * | one contact (A) | another (B) | A (phone wins); `conflictWith` = B so staff can merge later |
 * | several | any contact | the email match |
 * | several | none | a new contact (ambiguous phone; shows as a possible duplicate) |
 * | none | one contact | that contact |
 * | none | none | a new contact |
 *
 * Existing contacts are never overwritten, except that an empty primary email or phone is filled in
 * (unless another contact already has that email), and mapped `contact_input` form answers are saved.
 */
export async function linkContact(tx: Tx, scope: Scope, input: LinkInput): Promise<{ contactId: string; created: boolean; conflictWith?: string }> {
  const email = input.email?.trim().toLowerCase() || undefined;
  const phone = input.phone;
  // One person booking twice at once must not become two contacts.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${scope.clientId}:${phone?.e164 ?? email ?? input.name}`}, 0))`);

  const phoneMatches = phone
    ? ((await tx.execute(sql`select id from contacts where client_id = ${scope.clientId} and phones_primary_phone_number = ${phone.e164}`)).rows as { id: string }[]).map((r) => r.id)
    : [];
  const emailMatch = email ? ((await tx.execute(sql`select id from contacts where client_id = ${scope.clientId} and emails_primary_email = ${email}`)).rows[0] as { id: string } | undefined)?.id : undefined;

  const fields = await loadFields(tx, scope.clientId, objectDef("contacts"));
  const active = (key: string) => fields.some((f) => f.key === key && f.active && !f.system);
  const mapped = input.mapped && Object.keys(input.mapped).length ? validateInput(fields, input.mapped, "contact", false) : new Map<string, unknown>();

  let id: string | undefined;
  let conflictWith: string | undefined;
  if (phoneMatches.length === 1) {
    id = phoneMatches[0];
    if (emailMatch && emailMatch !== id) conflictWith = emailMatch;
  } else id = emailMatch;

  if (id) {
    const row = (await tx.execute(sql`select emails_primary_email, emails_additional_emails, phones_primary_phone_number, phones_additional_phones from contacts where client_id = ${scope.clientId} and id = ${id}`)).rows[0] as Row;
    const values = new Map(mapped);
    if (email && !row.emails_primary_email && active("emails") && (!emailMatch || emailMatch === id))
      values.set("emails", { primary_email: email, additional_emails: row.emails_additional_emails ?? [] });
    if (phone && !row.phones_primary_phone_number && active("phones"))
      values.set("phones", { primary_phone_number: phone.e164, primary_phone_country_code: phone.country, primary_phone_calling_code: phone.calling, additional_phones: row.phones_additional_phones ?? [] });
    if (values.size) await patchRecordTx(tx, scope, "contacts", fields, id, values);
    return { contactId: id, created: false, ...(conflictWith ? { conflictWith } : {}) };
  }

  const base: Record<string, unknown> = {};
  if (active("name")) base.name = split(input.name);
  if (email && active("emails")) base.emails = { primary_email: email };
  if (phone && active("phones")) base.phones = { primary_phone_number: phone.e164, primary_phone_country_code: phone.country, primary_phone_calling_code: phone.calling };
  const values = validateInput(fields, base, "staff", false);
  for (const [k, v] of mapped) if (!values.has(k)) values.set(k, v);
  try {
    // A savepoint: losing an email race aborts only this insert, and we then re-read the winner.
    const created = await tx.transaction((sp) =>
      insertRecordTx(sp as Tx, scope, "contacts", fields, values, { source: input.source, userId: input.actor.userId, name: input.actor.name }),
    );
    return { contactId: created.id, created: true };
  } catch (e) {
    const hit = e instanceof DomainError && e.code === "conflict" ? (e.details?.id as string | undefined) : undefined;
    const winner = hit ?? (email ? ((await tx.execute(sql`select id from contacts where client_id = ${scope.clientId} and emails_primary_email = ${email}`)).rows[0] as { id: string } | undefined)?.id : undefined);
    if (winner) return { contactId: winner, created: false };
    throw e;
  }
}

// Deleting a contact erases what past bookings kept about them. The attendee rows stay (seat counts, history),
// then the foreign key sets contact_id to null.
registerDeleteHook(async (tx, target) => {
  if (target.object !== "contact") return;
  await tx
    .update(appointmentAttendees)
    .set({ attendee: { name: "" }, answers: [] })
    .where(sql`${appointmentAttendees.clientId} = ${target.clientId} and ${appointmentAttendees.contactId} = ${target.id}`);
});

/**
 * One-off job for bookings made before contacts were linked: finds or creates the contact for every attendee that
 * has an email or phone and no contact yet. Safe to re-run. Details cleared by a contact deletion (empty name) are skipped.
 */
export async function backfillAttendeeContacts(db: Db, scope: Scope, batch = 200) {
  let linked = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (;;) {
    const done = await withTenant(db, scope, async (tx) => {
      const rows = (await tx.execute(sql`
        select a.id, a.attendee, c.default_country
        from appointment_attendees a
        join appointments p on p.id = a.appointment_id
        join calendars c on c.id = p.calendar_id
        where a.client_id = ${scope.clientId} and a.contact_id is null and a.attendee->>'name' <> ''
          and (a.attendee->>'email' is not null or a.attendee->>'phone' is not null)
        order by a.created_at limit ${batch}`)).rows as { id: string; attendee: { name: string; email?: string; phone?: string }; default_country: string | null }[];
      const todo = rows.filter((r) => !seen.has(r.id));
      for (const r of todo) {
        seen.add(r.id);
        try {
          const country = await defaultCountry(tx, scope.clientId, r.default_country);
          const phone = r.attendee.phone ? normalizePhone(r.attendee.phone, country) : undefined;
          const l = await tx.transaction((sp) => linkContact(sp as Tx, scope, { name: r.attendee.name, email: r.attendee.email, phone, source: "booking", actor: { userId: null, name: null } }));
          await tx.update(appointmentAttendees).set({ contactId: l.contactId }).where(eq(appointmentAttendees.id, r.id));
          linked++;
        } catch {
          skipped++; // e.g. a phone that no longer parses; left unlinked for a person to look at
        }
      }
      return todo.length === 0;
    });
    if (done) return { linked, skipped };
  }
}
