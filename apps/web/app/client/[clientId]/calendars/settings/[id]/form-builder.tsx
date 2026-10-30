"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../../../../../lib/api";
import type { FieldType, FormField } from "../../cal";

type ContactField = { key: string; type: string; label: string; active: boolean; contact_input: boolean; options: { id: string; label: string }[] | null };
type Row = { key?: string; label: string; type: FieldType; required: boolean; options: string; contactFieldKey: string };

const TYPES: FieldType[] = ["text", "textarea", "email", "phone", "number", "select", "multiselect", "checkbox", "date"];
/** Contact field types a booking question can be saved to, and the question type each one becomes. */
const MAPS: Record<string, FieldType> = { text: "text", number: "number", boolean: "checkbox", date: "date", select: "select", multi_select: "multiselect" };

/** The questions a visitor answers on the booking page, besides name, phone and email. */
export function FormBuilder({ clientId, form, editable, onSave }: { clientId: string; form: FormField[]; editable: boolean; onSave: (f: FormField[]) => void }) {
  const t = useTranslations("calendars.settings");
  const [rows, setRows] = useState<Row[]>(() => form.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, options: (f.options ?? []).join("\n"), contactFieldKey: f.contactFieldKey ?? "" })));
  const [contactFields, setContactFields] = useState<ContactField[]>([]);

  useEffect(() => {
    void api<{ fields: ContactField[] }>(`/api/clients/${clientId}/crm/metadata/contacts`).then((r) => r.ok && setContactFields(r.data.fields.filter((f) => f.active && f.contact_input && f.type in MAPS)));
  }, [clientId]);

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const link = (i: number, key: string) => {
    const cf = contactFields.find((f) => f.key === key);
    set(i, cf ? { contactFieldKey: key, type: MAPS[cf.type]!, options: (cf.options ?? []).map((o) => o.label).join("\n") } : { contactFieldKey: "" });
  };
  const move = (i: number, d: -1 | 1) => setRows((r) => { const n = [...r]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); return n; });

  const save = () =>
    onSave(rows.map((r) => ({
      ...(r.key ? { key: r.key } : {}), label: r.label, type: r.type, required: r.required,
      ...(r.type === "select" || r.type === "multiselect" ? { options: r.options.split("\n").map((o) => o.trim()).filter(Boolean) } : {}),
      ...(r.contactFieldKey ? { contactFieldKey: r.contactFieldKey } : {}),
    })));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
            <div className="flex flex-col gap-1.5"><Label>{t("fieldLabel")}</Label><Input value={r.label} disabled={!editable} maxLength={120} onChange={(e) => set(i, { label: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("fieldType")}</Label>
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" disabled={!editable || !!r.contactFieldKey} value={r.type} onChange={(e) => set(i, { type: e.target.value as FieldType })}>
                {TYPES.map((x) => <option key={x} value={x}>{t(`fieldTypes.${x}`)}</option>)}
              </select>
            </div>
          </div>
          {(r.type === "select" || r.type === "multiselect") && (
            <div className="flex flex-col gap-1.5"><Label>{t("fieldOptions")}</Label><textarea className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm" disabled={!editable || !!r.contactFieldKey} value={r.options} onChange={(e) => set(i, { options: e.target.value })} /></div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!editable} checked={r.required} onChange={(e) => set(i, { required: e.target.checked })} />{t("fieldRequired")}</label>
            {contactFields.length > 0 && (
              <select aria-label={t("linkContact")} className="h-8 rounded-md border border-input bg-background px-2 text-sm" disabled={!editable} value={r.contactFieldKey} onChange={(e) => link(i, e.target.value)}>
                <option value="">{t("noLink")}</option>
                {contactFields.map((f) => <option key={f.key} value={f.key}>{t("linkContact")}: {f.label}</option>)}
              </select>
            )}
            {editable && (
              <span className="ml-auto flex gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>{t("moveUp")}</Button>
                <Button type="button" size="sm" variant="ghost" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>{t("moveDown")}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>{t("remove")}</Button>
              </span>
            )}
          </div>
        </div>
      ))}
      {editable && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={rows.length >= 20} onClick={() => setRows((r) => [...r, { label: "", type: "text", required: false, options: "", contactFieldKey: "" }])}>{t("addField")}</Button>
          <Button type="button" onClick={save}>{t("saveForm")}</Button>
        </div>
      )}
    </div>
  );
}
