"use client";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { api } from "../../../../lib/api";
import { useClient } from "../client-workspace";
import { base, summary, type CrmRecord, type ListResponse, type Metadata } from "./crm";
import { FieldInput, FieldRow } from "./field-input";

const MAX_COLUMNS = 6;

export default function Contacts() {
  const { client } = useClient();
  const t = useTranslations("crm");
  const format = useFormatter();
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [items, setItems] = useState<CrmRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [pending, setPending] = useState(false);

  const load = useCallback(async (search: string, after?: string) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (after) params.set("cursor", after);
    const r = await api<ListResponse>(`${base(client.id)}/contacts?${params}`);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setItems((prev) => (after ? [...prev, ...r.data.items] : r.data.items));
    setCursor(r.data.next_cursor);
  }, [client.id]);

  useEffect(() => {
    void api<Metadata>(`${base(client.id)}/metadata/contacts`).then((r) => (r.ok ? setMeta(r.data) : setError(r.error)));
  }, [client.id]);

  // Debounced search; the first run loads the list.
  useEffect(() => {
    setLoading(true);
    const id = setTimeout(() => void load(q).finally(() => setLoading(false)), q ? 250 : 0);
    return () => clearTimeout(id);
  }, [q, load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setPending(true); setError(null);
    const r = await api<CrmRecord>(`${base(client.id)}/contacts`, { body: { fields: Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== null && v !== undefined)) } });
    setPending(false);
    if (!r.ok) { setError(r.error); return; }
    setDraft({}); setCreating(false);
    await load(q);
  }

  const fields = meta?.fields.filter((f) => f.active) ?? [];
  const columns = fields.slice(0, MAX_COLUMNS);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input className="max-w-xs" type="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" asChild><Link href={`/client/${client.id}/contacts/fields`}>{t("manageFields")}</Link></Button>
          <Button onClick={() => setCreating((v) => !v)} disabled={!meta}>{t("newContact")}</Button>
        </div>
      </div>

      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

      {creating && (
        <form onSubmit={create} className="mb-6 flex flex-col gap-4 rounded-lg border bg-card p-4">
          {fields.map((f) => (
            <FieldRow key={f.key} field={f}>
              <FieldInput field={f} value={draft[f.key]} currency={client.currency} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
            </FieldRow>
          ))}
          <div className="flex gap-2">
            <Button disabled={pending}>{t("create")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setCreating(false); setDraft({}); }}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {loading && !items.length ? <p className="text-muted-foreground">{t("loading")}</p> : !items.length ? <p className="text-muted-foreground">{q ? t("noMatches") : t("empty")}</p> : (
        <Table>
          <thead>
            <TableRow className="hover:bg-transparent">{columns.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}</TableRow>
          </thead>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                {columns.map((f, i) => {
                  const text = summary(f, r.fields[f.key], format) || "—";
                  return (
                    <TableCell key={f.key}>
                      {i === 0 ? <Link className="font-medium underline-offset-4 hover:underline" href={`/client/${client.id}/contacts/${r.id}`}>{text}</Link> : text}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {cursor && <div className="mt-4"><Button variant="outline" onClick={() => void load(q, cursor)}>{t("loadMore")}</Button></div>}
    </>
  );
}
