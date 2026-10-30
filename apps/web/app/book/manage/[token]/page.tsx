"use client";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Booking = { calendar_name: string; timezone: string; starts_at: string; ends_at: string; name: string; status: string; can_cancel: boolean };

/** The attendee's own booking, reached from the link they were given. The link is the credential. */
export default function Manage() {
  const { token } = useParams<{ token: string }>();
  const t = useTranslations("booking.manage");
  const format = useFormatter();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [b, setB] = useState<Booking | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch(`/api/public/booking/manage/${token}`).then(async (r) => (r.ok ? setB((await r.json()) as Booking) : setMissing(true)));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel() {
    if (!confirm(t("confirm"))) return;
    setError(null);
    const r = await fetch(`/api/public/booking/manage/${token}/cancel`, { method: "POST" });
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "Something went wrong");
    await load();
  }

  if (missing) return <p className="mx-auto mt-12 max-w-md px-4 text-muted-foreground">{t("notFound")}</p>;
  if (!b) return null;
  return (
    <div className="mx-auto mt-10 max-w-md px-4">
      <h1>{t("title")}</h1>
      <p><strong>{b.calendar_name}</strong><br />{format.dateTime(new Date(b.starts_at), { dateStyle: "full", timeStyle: "short", timeZone: tz })}</p>
      {b.status === "cancelled" ? <Alert>{t("cancelled")}</Alert> : b.can_cancel ? <Button variant="destructive" onClick={cancel}>{t("cancel")}</Button> : <p className="text-sm text-muted-foreground">{t("cannotCancel")}</p>}
      {error && <Alert variant="destructive" className="mt-3">{error}</Alert>}
    </div>
  );
}
