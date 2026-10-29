"use client";
import { useState, type FormEvent } from "react";
import { api } from "../../../../lib/api";
import { notifyClientsChanged } from "../../../../lib/clients-events";
import { TimezoneOptions } from "../../../clients/timezone-options";
import { useClient } from "../client-workspace";

export default function Settings() {
  const { client, label, reload } = useClient();
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
      <form onSubmit={onSubmit}>
        <label>Name<input name="name" defaultValue={client.name} required maxLength={120} /></label>
        <label>Timezone<input name="timezone" defaultValue={client.timezone} list="timezones" required /></label>
        <TimezoneOptions />
        <label>Currency<input name="currency" defaultValue={client.currency} required maxLength={3} /></label>
        {error && <p className="error">{error}</p>}
        {saved && <p className="ok">Saved.</p>}
        <button disabled={pending}>Save</button>
      </form>
      <h2>{archived ? "Restore" : "Archive"}</h2>
      <p className="hint">
        {archived
          ? `Restoring makes this ${label.toLowerCase()} active again.`
          : `Archiving hides this ${label.toLowerCase()} from the switcher and stops new invitations. Nothing is deleted.`}
      </p>
      <button className="secondary" disabled={pending} onClick={() => patch({ status: archived ? "active" : "archived" })}>
        {archived ? `Restore ${label.toLowerCase()}` : `Archive ${label.toLowerCase()}`}
      </button>
    </>
  );
}
