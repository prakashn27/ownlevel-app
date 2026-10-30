"use client";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addDays, addMonths, dayKeyOf, keyDate, startOfMonth, startOfWeek } from "../../../../lib/dates";

type Field = { key: string; label: string; type: "text" | "textarea" | "email" | "phone" | "number" | "select" | "multiselect" | "checkbox" | "date"; required: boolean; placeholder?: string; options?: string[] };
type Page = {
  client_name: string; name: string; description: string | null; type: string; duration_min: number; capacity: number | null; timezone: string;
  default_country: string; require_email: boolean; require_phone: boolean; booking_form: Field[]; hosts: { name: string }[];
};
type Slot = { start: string; end: string; seats_left?: number };
type Done = { booking: { starts_at: string; ends_at: string; calendar_name: string }; manage_token: string | null };

declare global { interface Window { turnstile?: { render(el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void }): string; reset(id?: string): void } } }

const url = (a: string, b: string) => `/api/public/booking/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;

/** The public booking page: no login, the agency's branding from the root layout. `?embed=1` hides that header for iframes. */
export function BookingPage({ clientSlug, calendarSlug, turnstileSiteKey }: { clientSlug: string; calendarSlug: string; turnstileSiteKey?: string }) {
  const t = useTranslations("booking");
  const format = useFormatter();
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const today = dayKeyOf(Date.now(), tz);

  const [page, setPage] = useState<Page | null>(null);
  const [missing, setMissing] = useState(false);
  const [month, setMonth] = useState(startOfMonth(today));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [country, setCountry] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [token, setToken] = useState("");
  const turnstileEl = useRef<HTMLDivElement>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("embed") === "1") document.body.dataset.embed = "1";
    void fetch(url(clientSlug, calendarSlug)).then(async (r) => {
      if (!r.ok) return setMissing(true);
      const p = (await r.json()) as Page;
      setPage(p); setCountry(p.default_country);
    });
  }, [clientSlug, calendarSlug]);

  // A month grid of days, with a day either side so timezones never hide a slot.
  const days = useMemo(() => { const s = startOfWeek(month); return Array.from({ length: 42 }, (_, i) => addDays(s, i)); }, [month]);
  const loadSlots = useCallback(async () => {
    const from = new Date(Date.parse(`${days[0]}T00:00:00Z`) - 86_400_000).toISOString();
    const to = new Date(Date.parse(`${days[41]}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    const r = await fetch(`${url(clientSlug, calendarSlug)}/slots?from=${from}&to=${to}`);
    if (r.ok) setSlots(((await r.json()) as { slots: Slot[] }).slots);
  }, [clientSlug, calendarSlug, days]);
  useEffect(() => { if (page) void loadSlots(); }, [page, loadSlots]);

  useEffect(() => {
    if (!turnstileSiteKey || !page || done) return;
    const render = () => {
      if (turnstileEl.current && !turnstileEl.current.hasChildNodes()) window.turnstile?.render(turnstileEl.current, { sitekey: turnstileSiteKey, callback: setToken, "expired-callback": () => setToken("") });
    };
    if (window.turnstile) { render(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = render;
    document.head.appendChild(s);
  }, [turnstileSiteKey, page, done, slot]);

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) { const k = dayKeyOf(Date.parse(s.start), tz); m.set(k, [...(m.get(k) ?? []), s]); }
    return m;
  }, [slots, tz]);
  const inMonth = days.some((d) => d.slice(0, 7) === month.slice(0, 7) && byDay.has(d));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    const f = new FormData(e.currentTarget);
    setError(null); setPending(true);
    const res = await fetch(`${url(clientSlug, calendarSlug)}/book`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
      body: JSON.stringify({
        starts_at: slot.start,
        phone_country: country,
        attendee: { name: f.get("name"), email: f.get("email") || undefined, phone: f.get("phone") || undefined, timezone: tz },
        answers,
        turnstile_token: token || undefined,
      }),
    });
    setPending(false);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return setDone(body as Done);
    if (body.reason === "slot_taken" || body.reason === "full") { setError(t("slotTaken")); setSlot(null); void loadSlots(); }
    else setError(body.message ?? "Something went wrong");
    window.turnstile?.reset(); setToken("");
  }

  if (missing) return <p className="mx-auto mt-12 max-w-md px-4 text-muted-foreground">{t("notFound")}</p>;
  if (!page) return <p className="mx-auto mt-12 max-w-md px-4 text-muted-foreground">{t("loading")}</p>;

  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: "short", timeZone: tz });

  if (done)
    return (
      <div className="mx-auto mt-10 max-w-md px-4">
        <h1>{t("confirmedTitle")}</h1>
        <p><strong>{done.booking.calendar_name}</strong><br />{format.dateTime(new Date(done.booking.starts_at), { dateStyle: "full", timeStyle: "short", timeZone: tz })}</p>
        {done.manage_token && (
          <p className="text-sm text-muted-foreground">{t("manageIntro")} <a href={`/book/manage/${done.manage_token}`}>{t("manageLink")}</a></p>
        )}
      </div>
    );

  return (
    <div className="mx-auto my-8 grid max-w-4xl gap-8 px-4 md:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground">{page.client_name}</div>
        <h1 className="m-0 text-xl">{page.name}</h1>
        <div className="text-sm text-muted-foreground">{t("minutes", { count: page.duration_min })}</div>
        {page.hosts.length > 0 && <div className="text-sm">{t("with", { hosts: page.hosts.map((h) => h.name).join(", ") })}</div>}
        {page.capacity && <div className="text-sm">{t("classNote", { count: page.capacity })}</div>}
        {page.description && <p className="whitespace-pre-line text-sm">{page.description}</p>}
        <div className="text-xs text-muted-foreground">{t("timesShownIn", { timezone: tz })}</div>
      </aside>

      <main>
        {!slot ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="m-0 mr-auto text-base">{format.dateTime(keyDate(month), { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
              <Button variant="ghost" size="sm" aria-label={t("previous")} disabled={month <= startOfMonth(today)} onClick={() => { setMonth(addMonths(month, -1)); setDay(null); }}><ChevronLeft className="size-4" /></Button>
              <Button variant="ghost" size="sm" aria-label={t("next")} onClick={() => { setMonth(addMonths(month, 1)); setDay(null); }}><ChevronRight className="size-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {days.slice(0, 7).map((d) => <div key={d}>{format.dateTime(keyDate(d), { weekday: "short", timeZone: "UTC" })}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((d) => {
                const has = byDay.has(d);
                return (
                  <button key={d} disabled={!has} onClick={() => setDay(d)} className={cn("aspect-square rounded-md text-sm", d.slice(0, 7) !== month.slice(0, 7) && "opacity-30", has ? "bg-primary/10 font-medium hover:bg-primary/20" : "text-muted-foreground", day === d && "bg-primary text-primary-foreground hover:bg-primary")}>
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>
            {!inMonth && <p className="mt-3 text-sm text-muted-foreground">{t("noTimesMonth")}</p>}
            {day && (
              <section className="mt-5">
                <h3 className="mt-0 text-sm font-semibold">{format.dateTime(keyDate(day), { dateStyle: "full", timeZone: "UTC" })}</h3>
                <div className="flex flex-wrap gap-2">
                  {(byDay.get(day) ?? []).map((s) => (
                    <Button key={s.start} variant="outline" onClick={() => setSlot(s)}>{time(s.start)}{s.seats_left !== undefined && <span className="text-xs text-muted-foreground">· {t("seatsLeft", { count: s.seats_left })}</span>}</Button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <form onSubmit={submit} className="flex max-w-md flex-col gap-3">
            <div>
              <strong>{format.dateTime(new Date(slot.start), { dateStyle: "full", timeStyle: "short", timeZone: tz })}</strong>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSlot(null)}>←</Button>
            </div>
            <h2 className="m-0 text-base">{t("details")}</h2>
            <div className="flex flex-col gap-1.5"><Label htmlFor="b-name">{t("name")}</Label><Input id="b-name" name="name" required maxLength={120} autoComplete="name" /></div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-phone">{t("phone")}{!page.require_phone && <span className="text-muted-foreground"> ({t("optional")})</span>}</Label>
              <div className="flex gap-2">
                <CountrySelect value={country} onChange={setCountry} className="w-40 shrink-0" />
                <Input id="b-phone" name="phone" type="tel" required={page.require_phone} autoComplete="tel-national" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="b-email">{t("email")}{!page.require_email && <span className="text-muted-foreground"> ({t("optional")})</span>}</Label><Input id="b-email" name="email" type="email" required={page.require_email} autoComplete="email" /></div>
            {page.booking_form.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`b-${f.key}`}>{f.label}{!f.required && <span className="text-muted-foreground"> ({t("optional")})</span>}</Label>
                {f.type === "textarea" ? <textarea id={`b-${f.key}`} className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm" required={f.required} placeholder={f.placeholder} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))} />
                : f.type === "select" ? (
                  <select id={`b-${f.key}`} className="h-9 rounded-md border border-input bg-background px-3 text-sm" required={f.required} defaultValue="" onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}>
                    <option value="" disabled>{t("select")}</option>{f.options?.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === "multiselect" ? (
                  <div className="flex flex-col gap-1">{f.options?.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm"><input type="checkbox" onChange={(e) => setAnswers((a) => { const cur = (a[f.key] as string[] | undefined) ?? []; return { ...a, [f.key]: e.target.checked ? [...cur, o] : cur.filter((x) => x !== o) }; })} />{o}</label>
                  ))}</div>
                ) : f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-sm"><input id={`b-${f.key}`} type="checkbox" required={f.required} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.checked }))} />{t("yes")}</label>
                ) : <Input id={`b-${f.key}`} type={f.type === "phone" ? "tel" : f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"} required={f.required} placeholder={f.placeholder} onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))} />}
              </div>
            ))}
            {turnstileSiteKey && <div ref={turnstileEl} />}
            {error && <Alert variant="destructive">{error}</Alert>}
            <div><Button disabled={pending || (!!turnstileSiteKey && !token)}>{pending ? t("booking") : t("book")}</Button></div>
          </form>
        )}
        {error && !slot && <Alert variant="destructive" className="mt-4">{error}</Alert>}
      </main>
    </div>
  );
}
