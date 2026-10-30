import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

export type Branding = {
  appName?: string;
  logoUrl?: string;
  primaryColor?: string;
  /** What the UI calls a client; default "Client". */
  clientLabel?: string;
};

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  currency: text("currency").notNull().default("USD"),
  /** Default country (ISO 3166-1 alpha-2) for phone numbers typed without a country code. */
  country: text("country").notNull().default("US"),
  branding: jsonb("branding").$type<Branding>().notNull().default({}),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agencyDomains = pgTable(
  "agency_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    kind: text("kind", { enum: ["subdomain", "custom"] }).notNull(),
    verificationToken: text("verification_token").notNull(),
    status: text("status", { enum: ["pending", "verified", "active", "failed", "disabled"] })
      .notNull()
      .default("pending"),
    tlsStatus: text("tls_status"),
    /** Cloudflare for SaaS custom hostname id, set once the hostname is registered. */
    cfHostnameId: text("cf_hostname_id"),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agency_domains_one_primary").on(t.agencyId).where(sql`${t.isPrimary}`),
    index("agency_domains_agency_idx").on(t.agencyId),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    currency: text("currency").notNull().default("USD"),
    /** Phone default country; null = the agency's. */
    country: text("country"),
    /** Booking page address: /book/{slug}/{calendar slug}. Unique per agency. */
    slug: text("slug"),
    /** Master switch: visitors' AI assistants may check times and book through the public MCP endpoint. Off until the client opts in. */
    aiBooking: boolean("ai_booking").notNull().default(false),
    settings: jsonb("settings").notNull().default({}),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_agency_idx").on(t.agencyId), uniqueIndex("clients_agency_slug").on(t.agencyId, t.slug).where(sql`${t.slug} is not null`)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = system role. */
    agencyId: uuid("agency_id").references(() => agencies.id),
    level: text("level", { enum: ["agency", "client"] }).notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
  },
  (t) => [unique("roles_agency_key").on(t.agencyId, t.key).nullsNotDistinct()],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    /** NULL = agency-level membership. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    clientAccess: text("client_access", { enum: ["all", "assigned"] }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("memberships_user_agency_client").on(t.userId, t.agencyId, t.clientId).nullsNotDistinct(),
    index("memberships_agency_idx").on(t.agencyId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    /** NULL = agency-level invite. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    /** Stored lowercased. */
    email: text("email").notNull(),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").notNull().references(() => user.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitations_agency_idx").on(t.agencyId, t.email)],
);
