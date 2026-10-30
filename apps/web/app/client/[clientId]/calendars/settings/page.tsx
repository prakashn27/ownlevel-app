"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "../../../../../lib/api";
import { useClient } from "../../client-workspace";
import { TYPES, base, type Calendar, type CalendarType } from "../cal";

export default function CalendarSettings() {
  const { client } = useClient();
  const t = useTranslations("calendars");
  const [items, setItems] = useState<Calendar[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<CalendarType>("personal");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ items: Calendar[] }>(`${base(client.id)}/calendars`);
    if (r.ok) setItems(r.data.items); else setError(r.error);
  }, [client.id]);
  useEffect(() => { void load(); }, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null); setPending(true);
    const r = await api<Calendar>(`${base(client.id)}/calendars`, {
      body: { type, name: f.get("name"), duration_min: Number(f.get("duration")), ...(type === "class" ? { capacity: Number(f.get("capacity")) } : {}) },
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    window.location.assign(`/client/${client.id}/calendars/settings/${r.data.id}`);
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" asChild><Link href={`/client/${client.id}/calendars`}>← {t("settings.back")}</Link></Button>
        <Button className="ml-auto" onClick={() => setCreating((v) => !v)}>{t("settings.newCalendar")}</Button>
      </div>
      {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

      {creating && (
        <form onSubmit={create} className="mb-6 flex flex-col gap-4 rounded-lg border bg-card p-4">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">{t("settings.chooseType")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPES.map((k) => (
                <label key={k} className={cn("cursor-pointer rounded-lg border p-3 text-sm", type === k ? "border-primary ring-1 ring-primary" : "hover:bg-accent/40")}>
                  <input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} className="sr-only" />
                  <div className="font-medium">{t(`types.${k}.name`)}</div>
                  <div className="text-muted-foreground">{t(`types.${k}.description`)}</div>
                  <div className="text-xs text-muted-foreground">{t(`types.${k}.example`)}</div>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="cal-name">{t("settings.name")}</Label><Input id="cal-name" name="name" required maxLength={120} /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="cal-dur">{t("settings.duration")}</Label><Input id="cal-dur" name="duration" type="number" min={5} max={480} step={5} defaultValue={30} required /></div>
            {type === "class" && <div className="flex flex-col gap-1.5"><Label htmlFor="cal-cap">{t("settings.capacity")}</Label><Input id="cal-cap" name="capacity" type="number" min={1} max={1000} defaultValue={10} required /></div>}
          </div>
          <div><Button disabled={pending}>{t("settings.create")}</Button></div>
        </form>
      )}

      {items && items.length === 0 && <p className="text-muted-foreground">{t("settings.empty")}</p>}
      {items && items.length > 0 && (
        <Table><TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium"><Link className="underline-offset-4 hover:underline" href={`/client/${client.id}/calendars/settings/${c.id}`}>{c.name}</Link></TableCell>
              <TableCell>{t(`types.${c.type}.name`)}</TableCell>
              <TableCell>{t("settings.hosts", { count: c.hosts.length })}</TableCell>
              <TableCell><Badge>{t(`status.${c.status}`)}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      )}
    </>
  );
}
