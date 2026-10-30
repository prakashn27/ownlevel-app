"use client";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "../../../../lib/api";
import { addDays, base, dayKeyOf, minutesOfDay, zonedToUtc, type Appointment, type Calendar, type Slot } from "./cal";

type Props = {
  clientId: string;
  tz: string;
  calendars: Calendar[];
  appointment?: Appointment;
  day: string;
  defaultCalendarId?: string;
  onClose: () => void;
  onChanged: () => void;
};

const Shell = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={onClose}>
    <div role="dialog" aria-label={title} className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
      <h2 className="mt-0">{title}</h2>
      {children}
    </div>
  </div>
);

/** One appointment (view, reschedule, cancel) or the form for a new one. Times are in the client's timezone. */
export function AppointmentDialog(p: Props) {
  return p.appointment ? <Details {...p} appointment={p.appointment} /> : <NewAppointment {...p} />;
}

function NewAppointment({ clientId, tz, calendars, day, defaultCalendarId, onClose, onChanged }: Props) {
  const t = useTranslations("calendars.appointment");
  const format = useFormatter();
  const [calendarId, setCalendarId] = useState(defaultCalendarId ?? calendars[0]?.id ?? "");
  const [date, setDate] = useState(day);
  const [time, setTime] = useState("");
  const [hostId, setHostId] = useState("auto");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cal = calendars.find((c) => c.id === calendarId);

  // Free times for the chosen day, from the same engine the public page will use.
  useEffect(() => {
    if (!calendarId) return;
    const from = zonedToUtc(date, "00:00", tz);
    const to = zonedToUtc(addDays(date, 1), "00:00", tz);
    void api<{ slots: Slot[] }>(`${base(clientId)}/calendars/${calendarId}/slots?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`).then((r) => setSlots(r.ok ? r.data.slots : []));
  }, [clientId, calendarId, date, tz]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null); setPending(true);
    const r = await api(`${base(clientId)}/appointments`, {
      body: {
        calendar_id: calendarId,
        starts_at: new Date(zonedToUtc(date, time, tz)).toISOString(),
        ...(cal?.type === "round_robin" && hostId !== "auto" ? { host_id: hostId } : {}),
        attendee: { name: f.get("name"), email: f.get("email") || undefined, phone: f.get("phone") || undefined },
        notes: f.get("notes") || undefined,
      },
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    onChanged(); onClose();
  }

  return (
    <Shell title={t("create")} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t("calendar")}</Label>
          <Select value={calendarId} onValueChange={(v) => { setCalendarId(v); setTime(""); setHostId("auto"); }}>
            <SelectTrigger><SelectValue placeholder={t("pickCalendar")} /></SelectTrigger>
            <SelectContent>{calendars.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="appt-date">{t("date")}</Label>
          <Input id="appt-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("freeSlots")}</Label>
          {slots.length ? (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => {
                const hhmm = (ms: number) => `${String(Math.floor(minutesOfDay(ms, tz) / 60)).padStart(2, "0")}:${String(minutesOfDay(ms, tz) % 60).padStart(2, "0")}`;
                const v = hhmm(Date.parse(s.start));
                return (
                  <button type="button" key={s.start} onClick={() => setTime(v)} className={cn("rounded-md border px-2 py-1 text-xs", time === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                    {format.dateTime(new Date(s.start), { timeStyle: "short", timeZone: tz })}{s.seatsLeft !== undefined && ` · ${t("seatsLeft", { count: s.seatsLeft })}`}
                  </button>
                );
              })}
            </div>
          ) : <p className="m-0 text-sm text-muted-foreground">{t("noFreeSlots")}</p>}
          <Label htmlFor="appt-time" className="mt-1 text-xs text-muted-foreground">{t("orEnterTime")}</Label>
          <Input id="appt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="w-36" />
        </div>
        {cal?.type === "round_robin" && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("host")}</Label>
            <Select value={hostId} onValueChange={setHostId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("anyHost")}</SelectItem>
                {cal.hosts.map((h) => <SelectItem key={h.user_id} value={h.user_id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5"><Label htmlFor="appt-name">{t("attendeeName")}</Label><Input id="appt-name" name="name" required maxLength={120} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5"><Label htmlFor="appt-email">{t("attendeeEmail")}</Label><Input id="appt-email" name="email" type="email" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="appt-phone">{t("attendeePhone")}</Label><Input id="appt-phone" name="phone" type="tel" /></div>
        </div>
        <p className="m-0 text-xs text-muted-foreground">{t("needsContact")}</p>
        <div className="flex flex-col gap-1.5"><Label htmlFor="appt-notes">{t("notes")}</Label><Input id="appt-notes" name="notes" maxLength={2000} /></div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex gap-2">
          <Button disabled={pending || !calendarId}>{t("create")}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button>
        </div>
      </form>
    </Shell>
  );
}

function Details({ clientId, tz, appointment: a, onClose, onChanged }: Props & { appointment: Appointment }) {
  const t = useTranslations("calendars.appointment");
  const ts = useTranslations("calendars.status");
  const format = useFormatter();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(a);
  const [resched, setResched] = useState(false);
  const [notes, setNotes] = useState(a.notes ?? "");
  const startMs = Date.parse(current.starts_at);
  const [date, setDate] = useState(dayKeyOf(startMs, tz));
  const [time, setTime] = useState(`${String(Math.floor(minutesOfDay(startMs, tz) / 60)).padStart(2, "0")}:${String(minutesOfDay(startMs, tz) % 60).padStart(2, "0")}`);
  const open = current.status === "booked";

  async function patch(path: string, body: unknown) {
    setError(null);
    const r = await api<Appointment>(`${base(clientId)}/appointments/${path}`, { method: "PATCH", body });
    if (!r.ok) return void setError(r.error);
    setCurrent(r.data); setResched(false); onChanged();
  }

  return (
    <Shell title={current.calendar_name ?? ""} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <strong>{format.dateTime(new Date(current.starts_at), { dateStyle: "full", timeStyle: "short", timeZone: tz })}</strong>
          <Badge>{ts(current.status)}</Badge>
        </div>
        {current.capacity !== null && <div className="text-muted-foreground">{t("seats", { taken: current.seats_taken, capacity: current.capacity })}</div>}
        <div><span className="text-muted-foreground">{t("hosts")}: </span>{current.hosts.map((h) => h.name).join(", ")}</div>
        <div>
          <div className="mb-1 text-muted-foreground">{t("attendees")}</div>
          <ul className="m-0 flex flex-col gap-2 p-0">
            {current.attendees.map((x) => (
              <li key={x.id} className="flex list-none flex-wrap items-center gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{x.attendee.name || t("deletedContact")} <Badge>{ts(x.status as "booked")}</Badge></div>
                  <div className="truncate text-xs text-muted-foreground">{[x.attendee.email, x.attendee.phone].filter(Boolean).join(" · ")}</div>
                </div>
                {open && x.status === "booked" && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => patch(`${current.id}/attendees/${x.id}`, { status: "attended" })}>{t("attended")}</Button>
                    <Button size="sm" variant="outline" onClick={() => patch(`${current.id}/attendees/${x.id}`, { status: "no_show" })}>{t("noShow")}</Button>
                    <Button size="sm" variant="outline" onClick={() => patch(`${current.id}/attendees/${x.id}`, { status: "cancelled" })}>{t("cancelAttendee")}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="appt-notes-edit">{t("notes")}</Label>
          <div className="flex gap-2">
            <Input id="appt-notes-edit" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            <Button variant="outline" disabled={notes === (current.notes ?? "")} onClick={() => patch(current.id, { notes: notes || null })}>{t("saveNotes")}</Button>
          </div>
        </div>
        {resched && (
          <div className="flex items-end gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("date")} />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("time")} className="w-32" />
            <Button onClick={() => patch(current.id, { starts_at: new Date(zonedToUtc(date, time, tz)).toISOString() })}>{t("save")}</Button>
          </div>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          {open && <Button variant="outline" onClick={() => setResched((v) => !v)}>{t("reschedule")}</Button>}
          {open && <Button variant="outline" onClick={() => patch(current.id, { status: "completed" })}>{t("markCompleted")}</Button>}
          {open && <Button variant="destructive" onClick={() => { if (confirm(t("confirmCancel"))) void patch(current.id, { status: "cancelled" }); }}>{t("cancelAppointment")}</Button>}
          <Button variant="ghost" onClick={onClose} className="ml-auto">{t("cancel")}</Button>
        </div>
      </div>
    </Shell>
  );
}
