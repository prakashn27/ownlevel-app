"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { CLIENTS_CHANGED } from "../lib/clients-events";

type Me = { name: string; email: string; agencies: { agencyId: string; name: string; role: string }[] };

type Client = { id: string; name: string; status: string };
type HostBranding = { branding?: { clientLabel?: string } };

/**
 * Portal frame with two clearly separated modes, so it is always obvious what a change applies to:
 * - agency view: everything outside /client/:id (agency-wide settings, team, client list)
 * - client view: /client/:id/... (only that client)
 * The agency is implied by the host, so URLs carry no agency id.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [label, setLabel] = useState("Client");

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  const loadClients = useCallback(() => {
    api<Client[]>("/api/clients").then((r) => r.ok && setClients(r.data));
  }, []);

  useEffect(() => {
    if (!session) return;
    api<Me>("/api/me").then((r) => r.ok && setMe(r.data));
    loadClients();
    api<HostBranding>("/api/host").then((r) => r.ok && r.data.branding?.clientLabel && setLabel(r.data.branding.clientLabel));
  }, [session, loadClients]);

  useEffect(() => {
    window.addEventListener(CLIENTS_CHANGED, loadClients);
    return () => window.removeEventListener(CLIENTS_CHANGED, loadClients);
  }, [loadClients]);

  if (isPending || !session || !me) return <div className="narrow"><p>Loading…</p></div>;

  if (me.agencies.length === 0)
    return (
      <div className="narrow">
        <p>You don’t have access to this portal.</p>
        <button onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</button>
      </div>
    );

  const clientId = path.match(/^\/client\/([^/]+)/)?.[1];
  const client = clientId ? clients.find((c) => c.id === clientId) : undefined;
  const lower = label.toLowerCase();
  const agencyName = me.agencies[0]!.name;

  const nav = clientId
    ? [
        { href: `/client/${clientId}`, label: "Overview" },
        { href: `/client/${clientId}/people`, label: "People" },
        { href: `/client/${clientId}/settings`, label: "Settings" },
      ]
    : [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/clients", label: `${label}s` },
        { href: "/team", label: "Team" },
        { href: "/settings/branding", label: "Branding" },
      ];
  // Archived clients stay out of the picker, except the one currently open.
  const pickable = clients.filter((c) => c.status === "active" || c.id === clientId);

  return (
    <div className={clientId ? "portal client-mode" : "portal agency-mode"}>
      <div className="context-bar" role="status">
        {clientId ? (
          <>
            <span className="context-kind">{label} view</span>
            <strong>{client?.name ?? "…"}</strong>
            {client?.status === "archived" && <span className="badge">Archived</span>}
            <span className="context-note">Changes here apply only to this {lower}.</span>
          </>
        ) : (
          <>
            <span className="context-kind">Agency view</span>
            <strong>{agencyName}</strong>
            <span className="context-note">Changes here apply to the whole agency.</span>
          </>
        )}
      </div>
      <div className="shell">
        <nav>
          {clientId && <Link href="/clients" className="back">← Back to agency</Link>}
          {pickable.length > 0 && (
            <select
              aria-label={`Switch ${lower}`}
              value={clientId ?? ""}
              onChange={(e) => e.target.value && router.push(`/client/${e.target.value}`)}
            >
              <option value="">{clientId ? `Switch ${lower}…` : `Open ${lower}…`}</option>
              {pickable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "active" : undefined}>{n.label}</Link>
          ))}
          <span className="spacer" />
          <p className="hint">{me.name}<br />{me.email}</p>
          <button className="secondary" onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</button>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
