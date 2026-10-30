"use client";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "../../../../lib/api";
import { useClient } from "../client-workspace";
import { AppointmentDialog } from "./appointment-dialog";
import { addDays, addMonths, base, byDay, dayKeyOf, keyDate, minutesOfDay, startOfMonth, startOfWeek, windowOf, type Appointment, type Calendar } from "./cal";

type View = "month" | "week" | "list";
const VIEWS: View[] = ["month", "week", "list"];
const LIST_DAYS = 30;
const ALL = "all";
const HOUR = 48; // px per hour in the week grid

export default function Calendars() {
  const { client } = useClient();
  const t = useTranslations("calendars");
  const format = useFormatter();
  const tz = client.timezone;
  const today = dayKeyOf(Date.now(), tz);

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(today);
  const [calendarId, setCalendarId] = useState(ALL);
  const [cals, setCals] = useState<Calendar[] | null>(null);
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ appointment?: Appointment; day?: string } | null>(null);

  // The days the current view shows.
  const days = useMemo(() => {
    if (view === "month") { const s = startOfWeek(startOfMonth(anchor)); return Array.from({ length: 42 }, (_, i) => addDays(s, i)); }
    if (view === "week") { const s = startOfWeek(anchor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
    return Array.from({ length: LIST_DAYS }, (_, i) => addDays(anchor, i));
  }, [view, anchor]);

  useEffect(() => { void api<{ items: Calendar[] }>(`${base(client.id)}/calendars`).then((r) => (r.ok ? setCals(r.data.items) : setError(r.error))); }, [client.id]);

  const load = useCallback(async () => {
    const { from, to } = windowOf(days[0]!, days[days.length - 1]!);
    const params = new URLSearchParams({ from, to, limit: "500" });
    if (calendarId !== ALL) params.set("calendarId", calendarId);
    const r = await api<{ items: Appointment[] }>(`${base(client.id)}/appointments?${params}`);
    if (!r.ok) return setError(r.error);
    setError(null);
    setItems(r.data.items);
  }, [client.id, days, calendarId]);
  useEffect(() => { void load(); }, [load]);

  const step = (dir: 1 | -1) => setAnchor(view === "month" ? addMonths(anchor, dir) : addDays(anchor, dir * (view === "week" ? 7 : LIST_DAYS)));
  const grouped = useMemo(() => byDay(items, tz), [items, tz]);
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: "short", timeZone: tz });
  const title =
    view === "month" ? format.dateTime(keyDate(anchor), { month: "long", year: "numeric", timeZone: "UTC" })
    : `${format.dateTime(keyDate(days[0]!), { dateStyle: "medium", timeZone: "UTC" })} – ${format.dateTime(keyDate(days[days.length - 1]!), { dateStyle: "medium", timeZone: "UTC" })}`;
  const weekdayNames = days.slice(0, 7).map((d) => format.dateTime(keyDate(d), { weekday: "short", timeZone: "UTC" }));

  const chip = (a: Appointment) => (
    <button
      key={a.id}
      onClick={(e) => { e.stopPropagation(); setDialog({ appointment: a }); }}
      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-xs", a.status === "cancelled" ? "bg-muted text-muted-foreground line-through" : "bg-primary/10 text-foreground hover:bg-primary/20")}
    >
      <span className="font-medium">{time(a.starts_at)}</span> {a.attendees[0]?.attendee.name || a.calendar_name}{a.attendees.length > 1 && ` +${a.attendees.length - 1}`}
    </button>
  );

  if (!cals) return error ? <Alert variant="destructive">{error}</Alert> : <p className="text-muted-foreground">{t("loading")}</p>;

  if (cals.length === 0)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">{t("noCalendars")} {t("createFirst")}</p>
        <Button asChild><Link href={`/client/${client.id}/calendars/settings`}>{t("manage")}</Link></Button>
      </div>
    );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>{t("today")}</Button>
        <Button variant="ghost" size="sm" aria-label={t("previous")} onClick={() => step(-1)}><ChevronLeft className="size-4" /></Button>
        <Button variant="ghost" size="sm" aria-label={t("next")} onClick={() => step(1)}><ChevronRight className="size-4" /></Button>
        <h2 className="m-0 mr-2 text-base font-semibold">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={calendarId} onValueChange={setCalendarId}>
            <SelectTrigger className="w-48" aria-label={t("appointment.calendar")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allCalendars")}</SelectItem>
              {cals?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border" role="tablist">
            {VIEWS.map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md", view === v ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{t(`views.${v}`)}</button>
            ))}
          </div>
          <Button variant="outline" asChild><Link href={`/client/${client.id}/calendars/settings`}>{t("manage")}</Link></Button>
          <Button onClick={() => setDialog({})}>{t("newAppointment")}</Button>
        </div>
      </div>
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

      {view === "month" && (
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
            {weekdayNames.map((n) => <div key={n} className="px-2 py-1.5">{n}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = grouped.get(d) ?? [];
              return (
                <div key={d} onClick={() => setDialog({ day: d })} className={cn("min-h-28 cursor-pointer border-b border-r p-1.5 hover:bg-accent/40", d.slice(0, 7) !== anchor.slice(0, 7) && "bg-muted/30 text-muted-foreground")}>
                  <div className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs", d === today && "bg-primary font-semibold text-primary-foreground")}>{Number(d.slice(8))}</div>
                  <div className="flex flex-col gap-0.5">
                    {list.slice(0, 3).map(chip)}
                    {list.length > 3 && <span className="px-1.5 text-xs text-muted-foreground">{t("more", { count: list.length - 3 })}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="overflow-auto rounded-lg border">
          <div className="grid min-w-[44rem] grid-cols-[3.5rem_repeat(7,1fr)] border-b bg-muted/50 text-xs font-medium">
            <div />
            {days.map((d, i) => (
              <div key={d} className={cn("px-2 py-1.5", d === today && "text-primary")}>{weekdayNames[i]} {Number(d.slice(8))}</div>
            ))}
          </div>
          <div className="relative grid min-w-[44rem] grid-cols-[3.5rem_repeat(7,1fr)]" style={{ height: 24 * HOUR }}>
            <div>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="pr-1 text-right text-[0.65rem] text-muted-foreground" style={{ height: HOUR }}>{h ? format.dateTime(new Date(Date.UTC(2000, 0, 1, h)), { hour: "numeric", timeZone: "UTC" }) : ""}</div>
              ))}
            </div>
            {days.map((d) => (
              <div key={d} onClick={() => setDialog({ day: d })} className="relative border-l" style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, var(--border) ${HOUR - 1}px, var(--border) ${HOUR}px)` }}>
                {(grouped.get(d) ?? []).map((a) => {
                  const start = minutesOfDay(Date.parse(a.starts_at), tz);
                  const len = Math.max((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000, 20);
                  return (
                    <button
                      key={a.id}
                      onClick={(e) => { e.stopPropagation(); setDialog({ appointment: a }); }}
                      style={{ top: (start / 60) * HOUR, height: (Math.min(len, 24 * 60 - start) / 60) * HOUR - 2 }}
                      className={cn("absolute inset-x-0.5 overflow-hidden rounded border-l-2 px-1 py-0.5 text-left text-xs", a.status === "cancelled" ? "border-muted-foreground bg-muted text-muted-foreground line-through" : "border-primary bg-primary/10 hover:bg-primary/20")}
                    >
                      <div className="font-medium">{time(a.starts_at)}</div>
                      <div className="truncate">{a.attendees[0]?.attendee.name || a.calendar_name}{a.attendees.length > 1 && ` +${a.attendees.length - 1}`}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="flex flex-col gap-4">
          {items.length === 0 && <p className="text-muted-foreground">{t("noAppointments")}</p>}
          {days.filter((d) => grouped.has(d)).map((d) => (
            <section key={d}>
              <h3 className="mb-1 mt-0 text-sm font-semibold">{format.dateTime(keyDate(d), { dateStyle: "full", timeZone: "UTC" })}</h3>
              <ul className="m-0 divide-y rounded-lg border p-0">
                {grouped.get(d)!.map((a) => (
                  <li key={a.id} className="list-none">
                    <button onClick={() => setDialog({ appointment: a })} className={cn("flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm hover:bg-accent/40", a.status === "cancelled" && "text-muted-foreground line-through")}>
                      <span className="w-28 shrink-0 font-medium">{time(a.starts_at)} – {time(a.ends_at)}</span>
                      <span className="min-w-0 flex-1 truncate">{a.attendees.map((x) => x.attendee.name || t("appointment.deletedContact")).join(", ") || "—"}</span>
                      <span className="text-muted-foreground">{a.calendar_name}</span>
                      <span className="text-muted-foreground">{a.hosts.map((h) => h.name).join(", ")}</span>
                      {a.capacity !== null && <span className="text-muted-foreground">{t("appointment.seats", { taken: a.seats_taken, capacity: a.capacity })}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {dialog && cals && (
        <AppointmentDialog
          clientId={client.id}
          tz={tz}
          calendars={cals.filter((c) => c.status !== "archived")}
          appointment={dialog.appointment}
          day={dialog.day ?? today}
          defaultCalendarId={calendarId === ALL ? undefined : calendarId}
          onClose={() => setDialog(null)}
          onChanged={() => { void load(); }}
        />
      )}
    </>
  );
}
