"use client";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Field } from "./crm";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const list = (text: string) => text.split(",").map((x) => x.trim()).filter(Boolean);
const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Converts what the user typed into the API value: null when empty. */
const nullIfEmpty = (o: Obj) => (Object.values(o).every((x) => x === "" || x === null || x === undefined || (Array.isArray(x) && !x.length)) ? null : o);

/** Edits one field. `value` is the API shape; `onChange(null)` clears it. */
export function FieldInput({ field, value, onChange, currency }: { field: Field; value: unknown; onChange: (v: unknown) => void; currency: string }) {
  const t = useTranslations("crm");
  const o = obj(value);
  const set = (patch: Obj) => onChange(nullIfEmpty({ ...o, ...patch }));
  const sub = (name: string, label: string, extra?: { type?: string }) => (
    <Input aria-label={`${field.label}: ${label}`} placeholder={label} type={extra?.type} value={s(o[name])} onChange={(e) => set({ [name]: e.target.value })} />
  );

  switch (field.type) {
    case "number":
      return <Input type="number" step="any" value={s(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "boolean":
      return <input type="checkbox" className="size-4" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
    case "date":
      return <Input type="date" value={s(value)} onChange={(e) => onChange(e.target.value || null)} />;
    case "date_time":
      return <Input type="datetime-local" value={value ? new Date(String(value)).toISOString().slice(0, 16) : ""} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    case "select":
      return (
        <select className={selectClass} value={s(value)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t("noValue")}</option>
          {field.options?.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      );
    case "multi_select": {
      const chosen = new Set((value as string[] | null) ?? []);
      return (
        <div className="flex flex-wrap gap-3">
          {field.options?.map((x) => (
            <label key={x.id} className="flex items-center gap-1.5 text-sm font-normal">
              <input type="checkbox" checked={chosen.has(x.id)} onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(x.id); else next.delete(x.id);
                onChange(next.size ? [...next] : null);
              }} />
              {x.label}
            </label>
          ))}
        </div>
      );
    }
    case "rating":
      return (
        <select className={selectClass} value={s(value)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{t("noValue")}</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={`RATING_${n}`}>{"★".repeat(n)}</option>)}
        </select>
      );
    case "currency":
      return (
        <div className="flex gap-2">
          <Input type="number" step="any" aria-label={`${field.label}: ${t("amount")}`} placeholder={t("amount")}
            value={typeof o.amount_micros === "number" ? o.amount_micros / 1e6 : ""}
            onChange={(e) => onChange(e.target.value === "" ? null : { amount_micros: Math.round(Number(e.target.value) * 1e6), currency_code: s(o.currency_code) || String(field.settings.defaultCurrency ?? currency) })} />
          <Input className="w-24" maxLength={3} aria-label={`${field.label}: ${t("currencyCode")}`} value={s(o.currency_code) || String(field.settings.defaultCurrency ?? currency)}
            onChange={(e) => o.amount_micros !== undefined && onChange({ ...o, currency_code: e.target.value.toUpperCase() })} />
        </div>
      );
    case "full_name":
      return <div className="grid gap-2 sm:grid-cols-2">{sub("first_name", t("firstName"))}{sub("last_name", t("lastName"))}</div>;
    case "emails":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {sub("primary_email", t("primaryEmail"), { type: "email" })}
          <Input aria-label={`${field.label}: ${t("additionalEmails")}`} placeholder={t("additionalEmails")} value={((o.additional_emails as string[]) ?? []).join(", ")}
            onChange={(e) => set({ additional_emails: list(e.target.value) })} />
        </div>
      );
    case "phones":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {sub("primary_phone_number", t("primaryPhone"), { type: "tel" })}
          <Input aria-label={`${field.label}: ${t("additionalPhones")}`} placeholder={t("additionalPhones")} value={((o.additional_phones as string[]) ?? []).join(", ")}
            onChange={(e) => set({ additional_phones: list(e.target.value) })} />
        </div>
      );
    case "links":
      return <div className="grid gap-2 sm:grid-cols-2">{sub("primary_link_url", t("url"), { type: "url" })}{sub("primary_link_label", t("linkLabel"))}</div>;
    case "address":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {sub("street1", t("street"))}{sub("city", t("city"))}{sub("postcode", t("postcode"))}{sub("state", t("state"))}{sub("country", t("country"))}
        </div>
      );
    case "rich_text":
      return <textarea className={`${selectClass} h-24 py-2`} value={s(o.markdown)} onChange={(e) => onChange(e.target.value ? { markdown: e.target.value } : null)} />;
    case "array":
      return <Input placeholder={t("commaSeparated")} value={((value as string[]) ?? []).join(", ")} onChange={(e) => onChange(list(e.target.value).length ? list(e.target.value) : null)} />;
    default:
      return <Input value={s(value)} maxLength={Number(field.settings.maxLength ?? 255)} onChange={(e) => onChange(e.target.value || null)} />;
  }
}

export function FieldRow({ field, children }: { field: Field; children: React.ReactNode }) {
  return (
    <Label className="flex flex-col gap-1.5">
      <span>{field.label}{field.required && <span className="text-destructive"> *</span>}</span>
      {children}
    </Label>
  );
}
