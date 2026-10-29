"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { TimezoneOptions } from "./timezone-options";

type Client = { id: string; name: string; timezone: string; currency: string; status: string };

export function ClientsPanel({ label }: { label: string }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Client[]>("/api/clients");
    if (r.ok) setClients(r.data);
    else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null); setPending(true);
    const f = new FormData(form);
    // Blank timezone/currency fall back to the agency's.
    const r = await api<Client>("/api/clients", { body: { name: f.get("name"), timezone: f.get("timezone") || undefined, currency: f.get("currency") || undefined } });
    setPending(false);
    if (!r.ok) return setError(r.error);
    // Full navigation so the switcher in the shell picks up the new client.
    window.location.assign(`/client/${r.data.id}`);
  }

  return (
    <>
      <h1>{label}s</h1>
      <form onSubmit={create}>
        <h2>New {label.toLowerCase()}</h2>
        <label>Name<input name="name" required maxLength={120} /></label>
        <span className="row">
          <label>Timezone<input name="timezone" list="timezones" placeholder="Agency default" /></label>
          <label>Currency<input name="currency" placeholder="Agency default" maxLength={3} /></label>
        </span>
        <TimezoneOptions />
        <button disabled={pending}>Create {label.toLowerCase()}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {clients && clients.length === 0 && <p>No {label.toLowerCase()}s yet.</p>}
      {clients && clients.length > 0 && (
        <table>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/client/${c.id}`}>{c.name}</Link>{c.status === "archived" && <span className="badge">Archived</span>}</td>
                <td>{c.timezone}</td><td>{c.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
