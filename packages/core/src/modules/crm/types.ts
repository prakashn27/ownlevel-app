/** Field types follow Twenty's FieldMetadataType, in snake case. `relation` arrives with companies (phase 2). */
export const CUSTOM_TYPES = [
  "text", "number", "boolean", "date", "date_time", "select", "multi_select", "rating",
  "currency", "full_name", "emails", "phones", "links", "address", "rich_text", "array",
] as const;
export type CustomFieldType = (typeof CUSTOM_TYPES)[number];
export type FieldType = CustomFieldType | "actor" | "position";

export type FieldOption = { id: string; label: string; color?: string; position: number };

/** A field defined in code. Clients can override some properties (see crm_fields). */
export type StandardField = {
  key: string;
  type: FieldType;
  label: string;
  /** Hidden from field settings and rejected on writes (created_by, position, avatar_url). */
  system?: boolean;
  /** Default true. `name` can never be turned off. */
  canDeactivate?: boolean;
  settings?: Record<string, unknown>;
};

export type ObjectDef = {
  /** Singular key stored in crm_fields.object. */
  key: "contact";
  /** API name and table. */
  table: "contacts";
  fields: StandardField[];
  /** Field keys whose values feed search_text. */
  searchable: string[];
  /** A record needs a value in at least one of these fields. */
  identifiers: string[];
};

/** A field as the rest of the app sees it: code definition merged with the client's overrides. */
export type FieldDef = {
  key: string;
  type: FieldType;
  label: string;
  description: string | null;
  standard: boolean;
  system: boolean;
  canDeactivate: boolean;
  active: boolean;
  required: boolean;
  contactInput: boolean;
  position: number;
  settings: Record<string, unknown>;
  options: FieldOption[] | null;
  defaultValue: unknown;
};
