"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
      <p className="hint">Shown on your login page, emails and portal.</p>
      <form onSubmit={onSubmit}>
        <label>App name<input value={v.appName} onChange={set("appName")} placeholder={agencyName} maxLength={60} /></label>
        <label>Logo URL<input value={v.logoUrl} onChange={set("logoUrl")} placeholder="https://…/logo.png" /></label>
        <label>
          Primary color
          <span className="row">
            <input type="color" value={v.primaryColor} onChange={set("primaryColor")} style={{ width: 56, padding: 2 }} />
            <input value={v.primaryColor} onChange={set("primaryColor")} maxLength={7} />
          </span>
        </label>
        <label>
          What do you call your clients?
          <input value={v.clientLabel} onChange={set("clientLabel")} placeholder="Client (e.g. Account, Location)" maxLength={30} />
        </label>
        {error && <p className="error">{error}</p>}
        {saved && <p className="ok">Saved.</p>}
        <button disabled={pending}>Save</button>
      </form>
      <h2>Preview</h2>
      <div className="preview">
        <span className="row">
          {v.logoUrl && <img src={v.logoUrl} alt="" height={28} />}
          <strong>{v.appName || agencyName}</strong>
        </span>
        <button type="button" style={{ background: v.primaryColor }}>Sign in</button>
      </div>
    </>
  );
}
