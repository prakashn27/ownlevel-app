"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Contact, LayoutDashboard, Users, UserCog, Palette, Building2, Settings, Eye, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
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
  const t = useTranslations();
  const router = useRouter();
  const path = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientLabel, setLabel] = useState<string | null>(null);

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

  if (isPending || !session || !me) return <div className="mx-auto mt-12 max-w-sm px-4 text-sm text-muted-foreground">{t("common.loading")}</div>;

  if (me.agencies.length === 0)
    return (
      <div className="mx-auto mt-12 flex max-w-sm flex-col items-start gap-3 px-4">
        <p>{t("shell.noAccess")}</p>
        <Button onClick={() => authClient.signOut().then(() => router.push("/login"))}>{t("common.signOut")}</Button>
      </div>
    );

  const clientId = path.match(/^\/client\/([^/]+)/)?.[1];
  const client = clientId ? clients.find((c) => c.id === clientId) : undefined;
  const label = clientLabel ?? t("common.defaultClientLabel");
  const labelLower = label.toLowerCase();
  const agencyName = me.agencies[0]!.name;

  const nav = clientId
    ? [
        { href: `/client/${clientId}`, label: t("shell.nav.overview"), icon: Eye },
        { href: `/client/${clientId}/contacts`, label: t("shell.nav.contacts"), icon: Contact },
        { href: `/client/${clientId}/people`, label: t("shell.nav.people"), icon: Users },
        { href: `/client/${clientId}/settings`, label: t("shell.nav.settings"), icon: Settings },
      ]
    : [
        { href: "/dashboard", label: t("shell.nav.dashboard"), icon: LayoutDashboard },
        { href: "/clients", label: t("shell.nav.clients", { label }), icon: Building2 },
        { href: "/team", label: t("shell.nav.team"), icon: UserCog },
        { href: "/settings/branding", label: t("shell.nav.branding"), icon: Palette },
      ];
  // Archived clients stay out of the picker, except the one currently open.
  const pickable = clients.filter((c) => c.status === "active" || c.id === clientId);

  return (
    <div>
      {/* Agency vs client view: the bar and sidebar make it obvious what a change applies to. */}
      <div
        role="status"
        className={cn(
          "flex items-center gap-3 border-b px-4 py-2 text-sm",
          clientId ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        <span className={cn("rounded px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider", clientId ? "bg-white/20" : "bg-border")}>
          {clientId ? t("shell.clientView", { label }) : t("shell.agencyView")}
        </span>
        <strong className="font-semibold">{clientId ? (client?.name ?? "…") : agencyName}</strong>
        {clientId && client?.status === "archived" && <Badge className="bg-white/25 text-inherit">{t("common.archived")}</Badge>}
        <span className="ml-auto opacity-80">
          {clientId ? t("shell.changesClient", { labelLower }) : t("shell.changesAgency")}
        </span>
      </div>
      <div className="flex min-h-[calc(100vh-4.5rem)]">
        <nav
          className={cn(
            "flex w-56 shrink-0 flex-col gap-1 border-r p-4",
            clientId ? "border-primary/25 bg-primary/5" : "bg-card",
          )}
        >
          {clientId && (
            <Link href="/clients" className="mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> {t("shell.backToAgency")}
            </Link>
          )}
          {pickable.length > 0 && (
            <Select value={clientId ?? ""} onValueChange={(id) => router.push(`/client/${id}`)}>
              <SelectTrigger aria-label={t("shell.switchClient", { labelLower })} className="mb-2">
                <SelectValue placeholder={t("shell.openClient", { labelLower })} />
              </SelectTrigger>
              <SelectContent>
                {pickable.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {nav.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:no-underline",
                  active ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <n.icon className="size-4" /> {n.label}
              </Link>
            );
          })}
          <span className="flex-1" />
          <p className="text-xs text-muted-foreground">{me.name}<br />{me.email}</p>
          <Button variant="outline" size="sm" onClick={() => authClient.signOut().then(() => router.push("/login"))}>
            <LogOut className="size-4" /> {t("common.signOut")}
          </Button>
        </nav>
        <main className="max-w-3xl flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
