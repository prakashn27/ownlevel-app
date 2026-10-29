import { bigint, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Usage ledger: every email, SMS and LLM call writes a row. client_id is null for agency-level activity. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id"),
    meter: text("meter").notNull(),
    quantity: numeric("quantity").notNull(),
    unitCostMicros: bigint("unit_cost_micros", { mode: "number" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_events_agency_idx").on(t.agencyId, t.clientId, t.occurredAt)],
);
