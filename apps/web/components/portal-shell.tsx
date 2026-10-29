"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";

type Me = { name: string; email: string; agencies: { agencyId: string; role: string }[] };

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/team", label: "Team" },
  { href: "/settings/branding", label: "Branding" },
];

/** Agency portal frame. The agency is implied by the host, so URLs carry no agency id. */
export function PortalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (session) api<Me>("/api/me").then((r) => r.ok && setMe(r.data));
  }, [session]);

  if (isPending || !session || !me) return <div className="narrow"><p>Loading…</p></div>;

  if (me.agencies.length === 0)
    return (
      <div className="narrow">
        <p>You don’t have access to this portal.</p>
        <button onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</button>
      </div>
    );

  return (
    <div className="shell">
      <nav>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? "active" : undefined}>{n.label}</Link>
        ))}
        <span className="spacer" />
        <p className="hint">{me.name}<br />{me.email}</p>
        <button className="secondary" onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</button>
      </nav>
      <main>{children}</main>
    </div>
  );
}
