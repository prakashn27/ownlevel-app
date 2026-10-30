// One-off: link bookings made before contacts existed to contacts (find or create, phone first, then email).
// Safe to re-run. Usage: pnpm --filter @ownlevel/api db:backfill-calendar-contacts <agencyId>
import { backfillAttendeeContacts, clients, withTenant } from "@ownlevel/core";
import { db } from "./db/index.js";

const agencyId = process.argv[2];
if (!agencyId) {
  console.error("Usage: db:backfill-calendar-contacts <agencyId>");
  process.exit(1);
}
const list = await withTenant(db, { agencyId }, (tx) => tx.select({ id: clients.id, name: clients.name }).from(clients));
for (const c of list) {
  const r = await backfillAttendeeContacts(db, { agencyId, clientId: c.id });
  console.log(`${c.name}: linked ${r.linked}, skipped ${r.skipped}`);
}
process.exit(0);
