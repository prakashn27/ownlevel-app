"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "../../../../../lib/api";
import { useClient } from "../../client-workspace";
import { base, type CrmRecord, type Metadata } from "../crm";
import type { Appointment } from "../../calendars/cal";
import { FieldInput, FieldRow } from "../field-input";

export default function ContactPage() {
  const { client, label } = useClient();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("crm");
  const format = useFormatter();
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [record, setRecord] = useState<CrmRecord | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);

  useEffect(() => {
    void (async () => {
      const [m, r] = await Promise.all([api<Metadata>(`${base(client.id)}/metadata/contacts`), api<CrmRecord>(`${base(client.id)}/contacts/${id}`)]);
      if (!m.ok) return setError(m.error);
      if (!r.ok) return setError(r.status === 404 ? t("notFound") : r.error);
      setMeta(m.data); setRecord(r.data); setValues(r.data.fields);
    })();
  }, [client.id, id, t]);

  useEffect(() => {
    void api<{ items: Appointment[] }>(`${base(client.id)}/contacts/${id}/appointments`).then((r) => r.ok && setAppointments(r.data.items));
  }, [client.id, id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!meta) return;
    setPending(true); setError(null); setSaved(false);
    // Every active field is sent; an emptied field is null, which clears it.
    const body = Object.fromEntries(meta.fields.filter((f) => f.active).map((f) => [f.key, values[f.key] ?? null]));
    const r = await api<CrmRecord>(`${base(client.id)}/contacts/${id}`, { method: "PATCH", body: { fields: body } });
    setPending(false);
    if (!r.ok) return setError(r.error);
    setRecord(r.data); setValues(r.data.fields); setSaved(true);
  }

  async function remove() {
    setPending(true); setError(null);
    const r = await api(`${base(client.id)}/contacts/${id}`, { method: "DELETE" });
    setPending(false);
    if (!r.ok) { setConfirming(false); return setError(r.error); }
    router.push(`/client/${client.id}/contacts`);
  }

  if (!meta || !record) return error ? <Alert variant="destructive">{error}</Alert> : <p className="text-muted-foreground">{t("loading")}</p>;

  return (
    <>
      <p className="mb-4 text-sm"><Link className="underline-offset-4 hover:underline" href={`/client/${client.id}/contacts`}>← {t("title")}</Link></p>
      <form onSubmit={save} className="flex max-w-2xl flex-col gap-4">
        {meta.fields.filter((f) => f.active).map((f) => (
          <FieldRow key={f.key} field={f}>
            <FieldInput field={f} value={values[f.key]} currency={client.currency} onChange={(v) => { setSaved(false); setValues((c) => ({ ...c, [f.key]: v })); }} />
          </FieldRow>
        ))}
        <p className="text-xs text-muted-foreground">
          {t("created", { date: format.dateTime(new Date(record.created_at), { dateStyle: "medium", timeStyle: "short" }) })}
          {" · "}
          {t("updated", { date: format.dateTime(new Date(record.updated_at), { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
        {error && <Alert variant="destructive">{error}</Alert>}
        {saved && <Alert variant="success">{t("saved")}</Alert>}
        <div><Button disabled={pending}>{t("save")}</Button></div>
      </form>

      <h2 className="mt-10">{t("appointments")}</h2>
      {appointments && appointments.length === 0 && <p className="text-sm text-muted-foreground">{t("noAppointments")}</p>}
      {appointments && appointments.length > 0 && (
        <ul className="m-0 flex max-w-2xl flex-col divide-y rounded-lg border p-0">
          {appointments.map((a) => (
            <li key={a.id} className="flex list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium">{format.dateTime(new Date(a.starts_at), { dateStyle: "medium", timeStyle: "short", timeZone: client.timezone })}</span>
              <span className="text-muted-foreground">{a.calendar_name}</span>
              <span className="text-muted-foreground">{a.hosts.map((h) => h.name).join(", ")}</span>
              <span className="ml-auto">{a.attendees[0]?.status ?? a.status}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10">{t("deleteTitle")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("deleteHelp", { labelLower: label.toLowerCase() })}</p>
      {confirming ? (
        <div className="flex gap-2">
          <Button variant="destructive" disabled={pending} onClick={remove}>{t("deleteConfirm")}</Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>{t("cancel")}</Button>
        </div>
      ) : <Button variant="outline" onClick={() => setConfirming(true)}>{t("delete")}</Button>}
    </>
  );
}
