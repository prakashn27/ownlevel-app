"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { api } from "../../../../../lib/api";
import { useClient } from "../../client-workspace";
import { FIELD_TYPES, base, type Field, type Metadata } from "../crm";

const selectClass = "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function ContactFields() {
  const { client } = useClient();
  const t = useTranslations("crm");
  const [fields, setFields] = useState<Field[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("text");
  const [pending, setPending] = useState(false);
  /** Custom field being deleted, with how many contacts have a value. */
  const [deleting, setDeleting] = useState<{ key: string; records: number } | null>(null);
  const url = `${base(client.id)}/metadata/contacts`;

  const load = useCallback(async () => {
    const r = await api<Metadata>(url);
    if (r.ok) setFields(r.data.fields); else setError(r.error);
  }, [url]);
  useEffect(() => { void load(); }, [load]);

  async function patch(key: string, body: Record<string, unknown>) {
    setError(null);
    const r = await api(`${url}/fields/${key}`, { method: "PATCH", body });
    if (!r.ok) setError(r.error);
    await load();
  }

  /** Swaps display positions with the neighbour. */
  async function move(i: number, dir: -1 | 1) {
    const a = fields[i]!;
    const b = fields[i + dir];
    if (!b) return;
    await patch(a.key, { position: b.position });
    await patch(b.key, { position: a.position });
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const options = String(f.get("options") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    setPending(true); setError(null);
    const r = await api(`${url}/fields`, { body: { label: f.get("label"), type, ...(type === "select" || type === "multi_select" ? { options } : {}) } });
    setPending(false);
    if (!r.ok) return setError(r.error);
    form.reset(); setType("text");
    await load();
  }

  async function askDelete(key: string) {
    const r = await api<{ records: number }>(`${url}/fields/${key}/usage`);
    if (!r.ok) return setError(r.error);
    setDeleting({ key, records: r.data.records });
  }

  async function confirmDelete() {
    if (!deleting) return;
    const r = await api(`${url}/fields/${deleting.key}`, { method: "DELETE" });
    setDeleting(null);
    if (!r.ok) setError(r.error);
    await load();
  }

  return (
    <>
      <p className="mb-4 text-sm"><Link className="underline-offset-4 hover:underline" href={`/client/${client.id}/contacts`}>← {t("title")}</Link></p>
      <p className="mb-4 text-sm text-muted-foreground">{t("fieldsIntro")}</p>
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

      <Table>
        <thead>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("fieldLabel")}</TableHead><TableHead>{t("fieldType")}</TableHead>
            <TableHead>{t("active")}</TableHead><TableHead>{t("required")}</TableHead><TableHead>{t("contactInput")}</TableHead><TableHead />
          </TableRow>
        </thead>
        <TableBody>
          {fields.map((f, i) => (
            <TableRow key={f.key}>
              <TableCell>
                <Input aria-label={t("fieldLabel")} defaultValue={f.label} maxLength={120} onBlur={(e) => e.target.value.trim() && e.target.value !== f.label && void patch(f.key, { label: e.target.value })} />
                <span className="mt-1 block text-xs text-muted-foreground">{f.key}{f.standard && <Badge className="ml-2">{t("standard")}</Badge>}</span>
              </TableCell>
              <TableCell>{t(`types.${f.type}` as never)}</TableCell>
              <TableCell><input type="checkbox" aria-label={t("active")} className="size-4" checked={f.active} disabled={!f.can_deactivate} onChange={(e) => void patch(f.key, { active: e.target.checked })} /></TableCell>
              <TableCell><input type="checkbox" aria-label={t("required")} className="size-4" checked={f.required} disabled={f.key === "name"} onChange={(e) => void patch(f.key, { required: e.target.checked })} /></TableCell>
              <TableCell><input type="checkbox" aria-label={t("contactInput")} className="size-4" checked={f.contact_input} onChange={(e) => void patch(f.key, { contact_input: e.target.checked })} /></TableCell>
              <TableCell className="whitespace-nowrap text-right">
                <Button size="sm" variant="ghost" disabled={i === 0} aria-label={t("moveUp")} onClick={() => void move(i, -1)}>↑</Button>
                <Button size="sm" variant="ghost" disabled={i === fields.length - 1} aria-label={t("moveDown")} onClick={() => void move(i, 1)}>↓</Button>
                {!f.standard && (deleting?.key === f.key ? (
                  <span className="ml-2 inline-flex items-center gap-2">
                    <span className="text-xs">{t("deleteFieldWarning", { count: deleting.records })}</span>
                    <Button size="sm" variant="destructive" onClick={() => void confirmDelete()}>{t("deleteConfirm")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
                  </span>
                ) : <Button size="sm" variant="outline" onClick={() => void askDelete(f.key)}>{t("delete")}</Button>)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h2 className="mt-8">{t("addField")}</h2>
      <form onSubmit={add} className="flex max-w-xl flex-col gap-4">
        <Label>{t("fieldLabel")}<Input name="label" required maxLength={120} /></Label>
        <Label>{t("fieldType")}
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            {FIELD_TYPES.map((x) => <option key={x} value={x}>{t(`types.${x}` as never)}</option>)}
          </select>
        </Label>
        {(type === "select" || type === "multi_select") && <Label>{t("options")}<Input name="options" required placeholder={t("commaSeparated")} /></Label>}
        <div><Button disabled={pending}>{t("addField")}</Button></div>
      </form>
    </>
  );
}
