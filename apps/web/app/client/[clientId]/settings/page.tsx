"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { api } from "../../../../lib/api";
import { notifyClientsChanged } from "../../../../lib/clients-events";
import { CountrySelect } from "@/components/ui/country-select";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { useClient } from "../client-workspace";
import { AiConnectHelp } from "./ai-connect-help";

export default function Settings() {
  const { client, label, reload } = useClient();
  const t = useTranslations();
  const labelLower = label.toLowerCase();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [booking, setBooking] = useState<{ slug: string | null; country: string | null; agency_country: string; ai_booking: boolean; mcp_url: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSaved, setBookingSaved] = useState(false);
  useEffect(() => { void api<NonNullable<typeof booking>>(`/api/clients/${client.id}/booking-settings`).then((r) => r.ok && setBooking(r.data)); }, [client.id]);

  async function saveBooking(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBookingError(null); setBookingSaved(false);
    const r = await api<NonNullable<typeof booking>>(`/api/clients/${client.id}/booking-settings`, { method: "PATCH", body: { slug: f.get("slug"), country: f.get("country") || null, ai_booking: f.get("ai_booking") === "on" } });
    if (!r.ok) return setBookingError(r.error);
    setBooking(r.data); setBookingSaved(true);
  }

  const logoInput = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  useEffect(() => { void api<{ url: string | null }>(`/api/clients/${client.id}/logo`).then((r) => r.ok && setLogo(r.data.url)); }, [client.id]);

  async function uploadLogo(file: File) {
    setLogoError(null);
    const res = await fetch(`/api/clients/${client.id}/logo`, { method: "PUT", headers: { "content-type": file.type }, body: file });
    const data = (await res.json().catch(() => ({}))) as { url?: string | null; message?: string };
    if (!res.ok) return setLogoError(data.message ?? t("client.settings.logoFailed"));
    setLogo(data.url ?? null);
  }

  async function removeLogo() {
    setLogoError(null);
    const r = await api<{ url: string | null }>(`/api/clients/${client.id}/logo`, { method: "DELETE" });
    if (!r.ok) return setLogoError(r.error);
    setLogo(null);
  }

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
      <h2>{t("client.settings.logoTitle")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("client.settings.logoHelp")}</p>
      <div className="flex items-center gap-3">
        {logo && <img src={logo} alt="" height={48} className="h-12 w-auto rounded border" />}
        <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }} />
        <Button type="button" variant="outline" onClick={() => logoInput.current?.click()}>{logo ? t("client.settings.logoReplace") : t("client.settings.logoUpload")}</Button>
        {logo && <Button type="button" variant="outline" onClick={removeLogo}>{t("client.settings.logoRemove")}</Button>}
      </div>
      {logoError && <Alert variant="destructive" className="mt-3">{logoError}</Alert>}
      {booking && (
        <>
          <h2>{t("client.settings.bookingTitle")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("client.settings.bookingIntro")}</p>
          <form onSubmit={saveBooking} className="flex flex-col gap-4">
            <Label>{t("client.settings.bookingSlug")}<Input name="slug" defaultValue={booking.slug ?? ""} required minLength={3} maxLength={60} /></Label>
            <p className="-mt-2 text-xs text-muted-foreground">{t("client.settings.bookingSlugHelp")}</p>
            <Label>{t("client.settings.country")}<CountrySelect name="country" defaultValue={booking.country ?? ""} emptyLabel={t("client.settings.useAgencyCountry", { country: booking.agency_country })} /></Label>
            <p className="-mt-2 text-xs text-muted-foreground">{t("client.settings.countryHelp")}</p>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="ai_booking" defaultChecked={booking.ai_booking} className="mt-1" /><span><b>{t("client.settings.aiBooking")}</b><br /><span className="text-muted-foreground">{t("client.settings.aiBookingHelp")}</span></span></label>
            {booking.ai_booking && booking.mcp_url && (
              <div>
                <div className="flex items-center gap-1"><Label>{t("client.settings.aiLink")}</Label><AiConnectHelp link={booking.mcp_url} /></div>
                <div className="flex items-center gap-2">
                  <Input readOnly value={booking.mcp_url} onFocus={(e) => e.target.select()} />
                  <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(booking.mcp_url!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? t("client.settings.copied") : t("client.settings.copy")}</Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("client.settings.aiLinkHelp")}</p>
              </div>
            )}
            {bookingError && <Alert variant="destructive">{bookingError}</Alert>}
            {bookingSaved && <Alert variant="success">{t("common.saved")}</Alert>}
            <div><Button>{t("client.settings.saveBooking")}</Button></div>
          </form>
        </>
      )}
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
