import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { agencies, clients } from "./tenancy-schema.js";

/**
 * Per-client field configuration: override rows for code-defined standard fields (standard = true),
 * full rows for custom fields. See docs/technical/5_2_contacts.md.
 * Configuration only, so it uses the standard tenant policy.
 */
export const crmFields = pgTable(
  "crm_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    object: text("object").notNull(),
    key: text("key").notNull(),
    standard: boolean("standard").notNull(),
    type: text("type"),
    label: text("label"),
    description: text("description"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    options: jsonb("options").$type<{ id: string; label: string; color?: string; position: number }[]>(),
    defaultValue: jsonb("default_value"),
    active: boolean("active").notNull().default(true),
    required: boolean("required").notNull().default(false),
    contactInput: boolean("contact_input").notNull().default(false),
    position: doublePrecision("position"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("crm_fields_client_object_key").on(t.clientId, t.object, t.key)],
);

/**
 * Contacts. Strict RLS (see migration): visible only when app.client_id equals the row's client_id,
 * never in agency context. Standard fields are columns named {field}_{sub_field}; custom values are in `data`.
 * Keep in sync with packages/core/src/modules/crm/standard/contact.ts (a test checks it).
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    position: doublePrecision("position").notNull().default(0),
    createdBySource: text("created_by_source").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    searchText: text("search_text").notNull().default(""),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    nameFirstName: text("name_first_name"),
    nameLastName: text("name_last_name"),
    emailsPrimaryEmail: text("emails_primary_email"),
    emailsAdditionalEmails: jsonb("emails_additional_emails").notNull().default([]),
    phonesPrimaryPhoneNumber: text("phones_primary_phone_number"),
    phonesPrimaryPhoneCountryCode: text("phones_primary_phone_country_code"),
    phonesPrimaryPhoneCallingCode: text("phones_primary_phone_calling_code"),
    phonesAdditionalPhones: jsonb("phones_additional_phones").notNull().default([]),
    jobTitle: text("job_title"),
    city: text("city"),
    linkedinPrimaryLinkUrl: text("linkedin_primary_link_url"),
    linkedinPrimaryLinkLabel: text("linkedin_primary_link_label"),
    linkedinSecondaryLinks: jsonb("linkedin_secondary_links").notNull().default([]),
    avatarUrl: text("avatar_url"),
  },
  (t) => [
    unique("contacts_client_id_id").on(t.clientId, t.id),
    uniqueIndex("contacts_client_email").on(t.clientId, t.emailsPrimaryEmail).where(sql`${t.emailsPrimaryEmail} is not null`),
    index("contacts_client_phone").on(t.clientId, t.phonesPrimaryPhoneNumber),
    index("contacts_client_position").on(t.clientId, t.position),
    index("contacts_search").using("gin", t.searchText.op("gin_trgm_ops")),
    index("contacts_data").using("gin", t.data.op("jsonb_path_ops")),
  ],
);
