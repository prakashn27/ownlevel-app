"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

type Targets = {
  agencies: { agencyId: string; name: string }[];
  clients: { agencyId: string; agencyName: string; clientId: string; name: string }[];
};

/** MCP authorization step: the user picks the agency, or one client, the connecting app will act on. */
export function SelectAgency() {
  const t = useTranslations("oauth.selectAgency");
  const tc = useTranslations("common");
  const [targets, setTargets] = useState<Targets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    api<Targets>("/api/oauth/targets").then((r) => {
      if (r.status === 401) return void (window.location.href = `/login${window.location.search}`);
      setTargets(r.ok ? r.data : { agencies: [], clients: [] });
    });
  }, []);

  async function choose(agencyId: string, clientId?: string) {
    setError(null);
    setPending(clientId ?? agencyId);
    const sel = await api("/api/oauth/select-agency", { body: { agencyId, clientId } });
    if (!sel.ok) {
      setPending(null);
      return setError(sel.error ?? tc("somethingWentWrong"));
    }
    // The client plugin adds the signed OAuth query from this page's URL.
    const res = await authClient.$fetch<{ url?: string }>("/oauth2/continue", { method: "POST", body: { postLogin: true } });
    if (res.data?.url) return void (window.location.href = res.data.url);
    setPending(null);
    setError(res.error?.message ?? tc("somethingWentWrong"));
  }

  return (
    <AuthCard title={t("title")}>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {targets && !targets.agencies.length && !targets.clients.length && <Alert>{t("none")}</Alert>}
      {!!targets?.agencies.length && targets.clients.length > 0 && <p className="text-sm font-medium">{t("agencies")}</p>}
      {targets?.agencies.map((a) => (
        <Button key={a.agencyId} variant="outline" disabled={pending !== null} onClick={() => choose(a.agencyId)}>
          {a.name}
        </Button>
      ))}
      {!!targets?.clients.length && <p className="text-sm font-medium">{t("clients")}</p>}
      {targets?.clients.map((c) => (
        <Button key={c.clientId} variant="outline" disabled={pending !== null} onClick={() => choose(c.agencyId, c.clientId)}>
          {t("clientOf", { client: c.name, agency: c.agencyName })}
        </Button>
      ))}
      {error && <Alert variant="destructive">{error}</Alert>}
    </AuthCard>
  );
}
