/** Shapes returned by /api/clients/:clientId/crm. Field and option labels are client data, not translated. */
export type Option = { id: string; label: string; color?: string; position: number };
export type Field = {
  key: string;
  type: string;
  label: string;
  description: string | null;
  standard: boolean;
  can_deactivate: boolean;
  active: boolean;
  required: boolean;
  contact_input: boolean;
  position: number;
  settings: Record<string, unknown>;
  options: Option[] | null;
};
export type CrmRecord = { id: string; fields: Record<string, unknown>; created_at: string; updated_at: string };
export type ListResponse = { items: CrmRecord[]; next_cursor: string | null };
export type Metadata = { object: string; fields: Field[] };

export const FIELD_TYPES = [
  "text", "number", "boolean", "date", "date_time", "select", "multi_select", "rating",
  "currency", "full_name", "emails", "phones", "links", "address", "rich_text", "array",
] as const;

export const base = (clientId: string) => `/api/clients/${clientId}/crm`;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** One-line text for a value, used in the table. */
export function summary(f: Field, v: unknown, format: { dateTime: (d: Date, o: object) => string; number: (n: number, o?: object) => string }): string {
  if (v === undefined || v === null) return "";
  const o = obj(v);
  switch (f.type) {
    case "full_name": return [o.first_name, o.last_name].filter(Boolean).join(" ");
    case "emails": return String(o.primary_email ?? "");
    case "phones": return String(o.primary_phone_number ?? "");
    case "links": return String(o.primary_link_label || o.primary_link_url || "");
    case "address": return [o.city, o.country].filter(Boolean).join(", ");
    case "rich_text": return String(o.markdown ?? "").slice(0, 80);
    case "currency": return typeof o.amount_micros === "number" ? `${format.number(o.amount_micros / 1e6, { style: "currency", currency: String(o.currency_code) })}` : "";
    case "boolean": return v ? "✓" : "✗";
    case "date": return format.dateTime(new Date(`${v}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
    case "date_time": return format.dateTime(new Date(String(v)), { dateStyle: "medium", timeStyle: "short" });
    case "select": return f.options?.find((x) => x.id === v)?.label ?? "";
    case "multi_select": return (v as string[]).map((id) => f.options?.find((x) => x.id === id)?.label ?? "").join(", ");
    case "rating": return "★".repeat(Number(String(v).slice(-1)));
    case "array": return (v as string[]).join(", ");
    default: return String(v);
  }
}
