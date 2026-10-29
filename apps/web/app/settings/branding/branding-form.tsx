"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "../../../lib/api";

type Branding = { appName?: string; logoUrl?: string; primaryColor?: string; clientLabel?: string };

export function BrandingForm({ agencyName, initial }: { agencyName: string; initial: Branding }) {
  const router = useRouter();
  const [v, setV] = useState({
    appName: initial.appName ?? "",
    logoUrl: initial.logoUrl ?? "",
    primaryColor: initial.primaryColor ?? "#4f46e5",
    clientLabel: initial.clientLabel ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { setSaved(false); setV({ ...v, [k]: e.target.value }); };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setPending(true);
    const r = await api("/api/agency/branding", { method: "PATCH", body: v });
    setPending(false);
    if (!r.ok) return setError(r.error);
    setSaved(true);
    router.refresh(); // re-render the layout with the new branding
  }

  return (
    <>
      <h1>Branding</h1>
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">Shown on your login page, emails and portal.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Label>App name<Input value={v.appName} onChange={set("appName")} placeholder={agencyName} maxLength={60} /></Label>
        <Label>Logo URL<Input value={v.logoUrl} onChange={set("logoUrl")} placeholder="https://…/logo.png" /></Label>
        <Label>
          Primary color
          <span className="flex items-center gap-2">
            <Input type="color" value={v.primaryColor} onChange={set("primaryColor")} className="w-14 p-1" />
            <Input value={v.primaryColor} onChange={set("primaryColor")} maxLength={7} />
          </span>
        </Label>
        <Label>
          What do you call your clients?
          <Input value={v.clientLabel} onChange={set("clientLabel")} placeholder="Client (e.g. Account, Location)" maxLength={30} />
        </Label>
        {error && <Alert variant="destructive">{error}</Alert>}
        {saved && <Alert variant="success">Saved.</Alert>}
        <div><Button disabled={pending}>Save</Button></div>
      </form>
      <h2>Preview</h2>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <span className="flex items-center gap-2">
            {v.logoUrl && <img src={v.logoUrl} alt="" height={28} className="h-7 w-auto" />}
            <strong>{v.appName || agencyName}</strong>
          </span>
          <div><Button type="button" style={{ background: v.primaryColor }}>Sign in</Button></div>
        </CardContent>
      </Card>
    </>
  );
}
