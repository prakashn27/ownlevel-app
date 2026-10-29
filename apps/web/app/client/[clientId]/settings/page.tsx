"use client";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { api } from "../../../../lib/api";
import { notifyClientsChanged } from "../../../../lib/clients-events";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { useClient } from "../client-workspace";

export default function Settings() {
  const { client, label, reload } = useClient();
  const t = useTranslations();
  const labelLower = label.toLowerCase();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setError(null); setSaved(false); setPending(true);
    const r = await api(`/api/clients/${client.id}`, { method: "PATCH", body });
    setPending(false);
    if (!r.ok) { setError(r.error); return false; }
    await reload();
    notifyClientsChanged();
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await patch({ name: f.get("name"), timezone: f.get("timezone"), currency: f.get("currency") })) setSaved(true);
  }

  const archived = client.status === "archived";
  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Label>{t("client.settings.name")}<Input name="name" defaultValue={client.name} required maxLength={120} /></Label>
        <Label>{t("client.settings.timezone")}<TimezoneSelect name="timezone" defaultValue={client.timezone} /></Label>
        <Label>{t("client.settings.currency")}<Input name="currency" defaultValue={client.currency} required maxLength={3} /></Label>
        {error && <Alert variant="destructive">{error}</Alert>}
        {saved && <Alert variant="success">{t("common.saved")}</Alert>}
        <div><Button disabled={pending}>{t("common.save")}</Button></div>
      </form>
      <h2>{archived ? t("client.settings.restore") : t("client.settings.archive")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {archived
          ? t("client.settings.restoreHelp", { labelLower })
          : t("client.settings.archiveHelp", { labelLower })}
      </p>
      <Button variant={archived ? "secondary" : "outline"} disabled={pending} onClick={() => patch({ status: archived ? "active" : "archived" })}>
        {archived ? t("client.settings.restoreButton", { labelLower }) : t("client.settings.archiveButton", { labelLower })}
      </Button>
    </>
  );
}
