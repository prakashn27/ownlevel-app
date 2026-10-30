"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountrySelect } from "@/components/ui/country-select";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { api } from "../../../../../../lib/api";
import { useClient } from "../../../client-workspace";
import { DAYS, base, type Calendar, type Day } from "../../cal";
import { FormBuilder } from "./form-builder";

type Person = { user_id: string; name: string; email: string };
type Hours = Partial<Record<Day, [string, string][]>>;

/** What a visitor must give besides their name. Either = phone or email, at least one. */
const CONTACT_RULES = {
  either: { require_phone: false, require_email: false },
  both: { require_phone: true, require_email: true },
  phone: { require_phone: true, require_email: false },
  email: { require_phone: false, require_email: true },
} as const;
type Rule = keyof typeof CONTACT_RULES;
const ruleOf = (c: Calendar): Rule => (c.require_phone && c.require_email ? "both" : c.require_phone ? "phone" : c.require_email ? "email" : "either");

export default function CalendarEditor() {
  const { client } = useClient();
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("calendars");
  const [cal, setCal] = useState<Calendar | null>(null);
  const [hours, setHours] = useState<Hours>({});
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookingSlug, setBookingSlug] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const url = `${base(client.id)}/calendars/${id}`;

  const load = useCallback(async () => {
    const r = await api<Calendar>(url);
    if (!r.ok) return void setError(r.error);
    setCal(r.data); setHours(r.data.weekly_hours);
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  // Only people allowed to configure calendars can list eligible hosts; others see a read-only page.
  useEffect(() => { void api<{ items: Person[] }>(`${base(client.id)}/calendars/eligible-hosts`).then((r) => setPeople(r.ok ? r.data.items : null)); }, [client.id]);

  useEffect(() => { void api<{ slug: string | null }>(`${base(client.id)}/booking-settings`).then((r) => r.ok && setBookingSlug(r.data.slug)); }, [client.id]);

  async function patch(body: Record<string, unknown>, done?: string) {
    setError(null); setNotice(null);
    const r = await api<Calendar>(url, { method: "PATCH", body });
    if (!r.ok) return void setError(r.error);
    setCal((c) => ({ ...c!, ...r.data })); setHours(r.data.weekly_hours);
    if (done) setNotice(done);
  }

  function saveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k));
    void patch({
      name: f.get("name"), slug: f.get("slug"), description: f.get("description") || null, timezone: f.get("timezone") || undefined,
      duration_min: n("duration_min"), slot_interval_min: n("slot_interval_min"), buffer_before_min: n("buffer_before_min"), buffer_after_min: n("buffer_after_min"),
      default_country: f.get("default_country") || null, ...CONTACT_RULES[String(f.get("contact_rule")) as Rule],
      min_notice_min: n("min_notice_min"), max_days_ahead: n("max_days_ahead"), ...(cal?.type === "class" ? { capacity: n("capacity") } : {}),
    }, t("settings.saved"));
  }

  async function hostCall(userId: string, remove: boolean) {
    setError(null);
    const r = await api<Calendar>(`${url}/hosts/${userId}`, { method: remove ? "DELETE" : "PUT", body: remove ? undefined : {} });
    if (!r.ok) return void setError(r.error);
    setCal((c) => ({ ...c!, ...r.data }));
  }

  async function override(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const date = String(f.get("date"));
    const intervals = f.get("closed") === "on" ? [] : [[String(f.get("from")), String(f.get("to"))]];
    setError(null);
    const r = await api(`${url}/overrides/${date}`, { method: "PUT", body: { intervals } });
    if (!r.ok) return void setError(r.error);
    void load();
  }

  if (!cal) return error ? <Alert variant="destructive">{error}</Alert> : <p className="text-muted-foreground">{t("loading")}</p>;
  const editable = people !== null;
  const single = cal.type === "personal" || cal.type === "class";
  const setDay = (d: Day, iv: [string, string][]) => setHours((h) => ({ ...h, [d]: iv }));

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" asChild><Link href={`/client/${client.id}/calendars/settings`}>← {t("settings.title")}</Link></Button>
        <Badge className="ml-auto">{t(`status.${cal.status}`)}</Badge>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {!editable && <p className="m-0 text-sm text-muted-foreground">{t("settings.readOnly")}</p>}

      <section>
        <h2 className="mt-0">{t("settings.details")}</h2>
        <form onSubmit={saveDetails} className="grid gap-3 sm:grid-cols-2">
          <fieldset disabled={!editable} className="contents">
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-name">{t("settings.name")}</Label><Input id="c-name" name="name" defaultValue={cal.name} required maxLength={120} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-type">{t("settings.type")}</Label><Input id="c-type" value={t(`types.${cal.type}.name`)} disabled readOnly /><span className="text-xs text-muted-foreground">{t("settings.typeFixed")}</span></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="c-slug">{t("settings.slug")}</Label><Input id="c-slug" name="slug" defaultValue={cal.slug} required /><span className="text-xs text-muted-foreground">{t("settings.slugHelp")}</span></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="c-desc">{t("settings.description")}</Label><Input id="c-desc" name="description" defaultValue={cal.description ?? ""} maxLength={2000} /></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label>{t("settings.timezone")}</Label><TimezoneSelect name="timezone" defaultValue={cal.timezone} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-dur">{t("settings.duration")}</Label><Input id="c-dur" name="duration_min" type="number" min={5} max={480} defaultValue={cal.duration_min} required /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-int">{t("settings.interval")}</Label><Input id="c-int" name="slot_interval_min" type="number" min={5} max={480} defaultValue={cal.slot_interval_min} required /></div>
            {cal.type === "class" && <div className="flex flex-col gap-1.5"><Label htmlFor="c-cap">{t("settings.capacity")}</Label><Input id="c-cap" name="capacity" type="number" min={1} max={1000} defaultValue={cal.capacity ?? 1} required /></div>}
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-bb">{t("settings.bufferBefore")}</Label><Input id="c-bb" name="buffer_before_min" type="number" min={0} max={240} defaultValue={cal.buffer_before_min} required /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-ba">{t("settings.bufferAfter")}</Label><Input id="c-ba" name="buffer_after_min" type="number" min={0} max={240} defaultValue={cal.buffer_after_min} required /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-mn">{t("settings.minNotice")}</Label><Input id="c-mn" name="min_notice_min" type="number" min={0} max={43200} defaultValue={cal.min_notice_min} required /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-md">{t("settings.maxDaysAhead")}</Label><Input id="c-md" name="max_days_ahead" type="number" min={1} max={365} defaultValue={cal.max_days_ahead} required /></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="c-country">{t("settings.defaultCountry")}</Label><CountrySelect id="c-country" name="default_country" defaultValue={cal.default_country ?? ""} emptyLabel={t("settings.useClientCountry")} /></div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="c-rule">{t("settings.contactRule")}</Label>
              <select id="c-rule" name="contact_rule" defaultValue={ruleOf(cal)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                {(Object.keys(CONTACT_RULES) as Rule[]).map((k) => <option key={k} value={k}>{t(`settings.contactRules.${k}`)}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">{t("settings.requireHelp")}</span>
            </div>
            <div className="sm:col-span-2"><Button>{t("settings.saveDetails")}</Button></div>
          </fieldset>
        </form>
      </section>

      <section>
        <h2 className="mt-0">{t("settings.pageTitle")}</h2>
        {bookingSlug === null ? (
          <p className="m-0 text-sm text-muted-foreground">{t("settings.pageNeedsSlug")}</p>
        ) : bookingSlug ? (
          <>
            {cal.status !== "published" && <p className="mt-0 text-sm text-muted-foreground">{t("settings.pageDraft")}</p>}
            <div className="flex items-center gap-2">
              <Input readOnly value={`${typeof window === "undefined" ? "" : window.location.origin}/book/${bookingSlug}/${cal.slug}`} onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/book/${bookingSlug}/${cal.slug}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? t("settings.copied") : t("settings.copy")}</Button>
            </div>
            <details className="mt-2 text-sm"><summary className="cursor-pointer">{t("settings.embed")}</summary>
              <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">{`<iframe src="${typeof window === "undefined" ? "" : window.location.origin}/book/${bookingSlug}/${cal.slug}?embed=1" width="100%" height="720" style="border:0"></iframe>`}</code>
            </details>
          </>
        ) : null}
      </section>

      <section>
        <h2 className="mt-0">{t("settings.bookingForm")}</h2>
        <p className="mt-0 text-sm text-muted-foreground">{t("settings.bookingFormHelp")}</p>
        <FormBuilder clientId={client.id} form={cal.booking_form} editable={editable} onSave={(f) => void patch({ booking_form: f }, t("settings.saved"))} />
      </section>

      <section>
        <h2 className="mt-0">{t("settings.hostsTitle")}</h2>
        <p className="mt-0 text-sm text-muted-foreground">{single ? t("settings.hostsHelpOne") : t("settings.hostsHelpMany")}</p>
        {cal.hosts.length === 0 && <p className="text-sm text-muted-foreground">{t("settings.noHosts")}</p>}
        <ul className="m-0 mb-3 flex flex-col gap-1 p-0">
          {cal.hosts.map((h) => (
            <li key={h.user_id} className="flex list-none items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{h.name}</span><span className="text-muted-foreground">{h.email}</span>
              {editable && <Button size="sm" variant="outline" className="ml-auto" onClick={() => hostCall(h.user_id, true)}>{t("settings.remove")}</Button>}
            </li>
          ))}
        </ul>
        {editable && (
          <Select value="" onValueChange={(v) => void hostCall(v, false)}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("settings.addHost")} /></SelectTrigger>
            <SelectContent>
              {people.filter((p) => !cal.hosts.some((h) => h.user_id === p.user_id)).map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.name} · {p.email}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </section>

      <section>
        <h2 className="mt-0">{t("settings.hours")}</h2>
        <div className="flex flex-col gap-2">
          {DAYS.map((d) => {
            const iv = hours[d] ?? [];
            return (
              <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 font-medium">{t(`days.${d}`)}</span>
                {iv.length === 0 && <span className="text-muted-foreground">{t("settings.closed")}</span>}
                {iv.map(([a, b], i) => (
                  <span key={i} className="flex items-center gap-1">
                    <Input type="time" className="w-28" disabled={!editable} value={a} onChange={(e) => setDay(d, iv.map((x, j) => (j === i ? [e.target.value, b] : x)))} />–
                    <Input type="time" className="w-28" disabled={!editable} value={b} onChange={(e) => setDay(d, iv.map((x, j) => (j === i ? [a, e.target.value] : x)))} />
                    {editable && <Button size="sm" variant="ghost" onClick={() => setDay(d, iv.filter((_, j) => j !== i))}>{t("settings.remove")}</Button>}
                  </span>
                ))}
                {editable && <Button size="sm" variant="outline" onClick={() => setDay(d, [...iv, iv.length ? [iv[iv.length - 1]![1], "23:00"] : ["09:00", "17:00"]])}>{t("settings.addRange")}</Button>}
              </div>
            );
          })}
        </div>
        {editable && <Button className="mt-3" onClick={() => patch({ weekly_hours: hours }, t("settings.saved"))}>{t("settings.saveHours")}</Button>}
      </section>

      <section>
        <h2 className="mt-0">{t("settings.overrides")}</h2>
        <p className="mt-0 text-sm text-muted-foreground">{t("settings.overridesHelp")}</p>
        <ul className="m-0 mb-3 flex flex-col gap-1 p-0">
          {(cal.overrides ?? []).map((o) => (
            <li key={o.date} className="flex list-none items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{o.date}</span>
              <span className="text-muted-foreground">{o.intervals.length ? o.intervals.map(([a, b]) => `${a}–${b}`).join(", ") : t("settings.closed")}</span>
              {editable && <Button size="sm" variant="outline" className="ml-auto" onClick={async () => { await api(`${url}/overrides/${o.date}`, { method: "DELETE" }); void load(); }}>{t("settings.clear")}</Button>}
            </li>
          ))}
        </ul>
        {editable && (
          <form onSubmit={override} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5"><Label htmlFor="o-date">{t("settings.overrideDate")}</Label><Input id="o-date" name="date" type="date" required /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="o-from">{t("settings.overrideFrom")}</Label><Input id="o-from" name="from" type="time" defaultValue="09:00" className="w-28" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="o-to">{t("settings.overrideTo")}</Label><Input id="o-to" name="to" type="time" defaultValue="17:00" className="w-28" /></div>
            <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="closed" />{t("settings.overrideClosed")}</label>
            <Button>{t("settings.setOverride")}</Button>
          </form>
        )}
      </section>

      {editable && (
        <section className="flex flex-wrap gap-2">
          {cal.status !== "published" && <Button onClick={() => patch({ status: "published" })}>{t("settings.publish")}</Button>}
          {cal.status === "published" && <Button variant="outline" onClick={() => patch({ status: "draft" })}>{t("settings.unpublish")}</Button>}
          <Button variant="destructive" onClick={async () => { if (!confirm(t("settings.confirmArchive"))) return; const r = await api(url, { method: "DELETE" }); if (r.ok) window.location.assign(`/client/${client.id}/calendars/settings`); else setError(r.error); }}>{t("settings.archive")}</Button>
        </section>
      )}
    </div>
  );
}
