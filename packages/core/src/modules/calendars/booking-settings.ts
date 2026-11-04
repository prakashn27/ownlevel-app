import { and, eq } from "drizzle-orm";
import { agencies, clients, withTenant, type Db } from "../../db/index.js";
import { DomainError } from "../../errors.js";
import { requireCalendars, type CalendarScope } from "./access.js";
import { RESERVED, parseCountry, parseSlug } from "./calendars.js";

export const AI_DESCRIPTION_MAX = 2000;

/** The client's public booking address (`/book/{slug}/...`), the default country for phone numbers, and whether AI assistants may book. */
export const getBookingSettings = (db: Db, scope: CalendarScope) =>
  withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    const [c] = await tx.select({ slug: clients.slug, country: clients.country, agency: agencies.country, agencySlug: agencies.slug, aiBooking: clients.aiBooking, aiDescription: clients.aiDescription }).from(clients).innerJoin(agencies, eq(agencies.id, clients.agencyId)).where(eq(clients.id, scope.clientId));
    return { slug: c!.slug, country: c!.country, agency_country: c!.agency, effective_country: c!.country ?? c!.agency, ai_booking: c!.aiBooking, ai_description: c!.aiDescription, agency_slug: c!.agencySlug, reserved: [...RESERVED] };
  });

/** The client's timezone, for turning local dates into ranges. Anyone who can read calendars may read it. */
export const getClientTimezone = (db: Db, scope: CalendarScope) =>
  withTenant(db, scope, async (tx) => {
    await requireCalendars(tx, scope, "read");
    const [c] = await tx.select({ timezone: clients.timezone }).from(clients).where(eq(clients.id, scope.clientId));
    return c!.timezone;
  });

export async function updateBookingSettings(db: Db, scope: CalendarScope, input: Record<string, unknown>) {
  const patch: { slug?: string; country?: string | null; aiBooking?: boolean; aiDescription?: string | null } = {};
  if (input.slug !== undefined) patch.slug = parseSlug(input.slug);
  if (input.country !== undefined) patch.country = input.country === null ? null : (parseCountry(input.country) ?? null);
  if (input.ai_booking !== undefined) {
    const v = input.ai_booking;
    if (typeof v !== "boolean") throw new DomainError("invalid_input", "ai_booking must be true or false.");
    patch.aiBooking = v;
  }
  if (input.ai_description !== undefined) {
    const v = input.ai_description;
    if (v !== null && typeof v !== "string") throw new DomainError("invalid_input", "ai_description must be text.");
    const text = v?.trim() ?? "";
    if (text.length > AI_DESCRIPTION_MAX) throw new DomainError("invalid_input", `ai_description must be at most ${AI_DESCRIPTION_MAX} characters.`);
    patch.aiDescription = text || null;
  }
  if (!Object.keys(patch).length) throw new DomainError("invalid_input", "Nothing to update.");
  // Permission check in the client's context. The write itself runs in agency context: RLS only lets agency context
  // change a clients row (a client_admin may edit just these booking settings, never the rest of the row).
  await withTenant(db, scope, (tx) => requireCalendars(tx, scope, "clientSettings"));
  try {
    return await withTenant(db, { agencyId: scope.agencyId, userId: scope.userId }, async (tx) => {
      await tx.update(clients).set(patch).where(and(eq(clients.id, scope.clientId), eq(clients.agencyId, scope.agencyId)));
      const [c] = await tx.select({ slug: clients.slug, country: clients.country, agency: agencies.country, agencySlug: agencies.slug, aiBooking: clients.aiBooking, aiDescription: clients.aiDescription }).from(clients).innerJoin(agencies, eq(agencies.id, clients.agencyId)).where(eq(clients.id, scope.clientId));
      return { slug: c!.slug, country: c!.country, agency_country: c!.agency, effective_country: c!.country ?? c!.agency, ai_booking: c!.aiBooking, ai_description: c!.aiDescription, agency_slug: c!.agencySlug };
    });
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === "23505") throw new DomainError("slug_taken", "That address is already used by another client.");
    throw e;
  }
}
