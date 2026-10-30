import type { ObjectDef } from "../types.js";

/**
 * Standard fields of a contact. Composite types map to columns {key}_{sub} on `contacts`
 * (packages/core/src/db/crm-schema.ts); a test checks the two stay in sync.
 */
export const contactObject: ObjectDef = {
  key: "contact",
  table: "contacts",
  searchable: ["name", "emails", "phones"],
  identifiers: ["name", "emails", "phones"],
  fields: [
    { key: "name", type: "full_name", label: "Name", canDeactivate: false },
    { key: "emails", type: "emails", label: "Emails" },
    { key: "phones", type: "phones", label: "Phones" },
    { key: "job_title", type: "text", label: "Job title" },
    { key: "city", type: "text", label: "City" },
    { key: "linkedin", type: "links", label: "LinkedIn" },
    { key: "avatar_url", type: "text", label: "Avatar", system: true, settings: { maxLength: 2048 } },
    { key: "created_by", type: "actor", label: "Created by", system: true },
    { key: "position", type: "position", label: "Position", system: true },
  ],
};

/** Keys a record can never use for a custom field. */
export const RESERVED_KEYS = ["id", "data", "fields", "created_at", "updated_at", "agency_id", "client_id", "search_text"];
