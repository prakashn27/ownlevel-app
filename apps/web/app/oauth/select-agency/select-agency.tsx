"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

type Agency = { agencyId: string; name: string; role: string };

/** MCP authorization step: the user picks which agency the connecting app will act on. */
export function SelectAgency() {
  const t = useTranslations("oauth.selectAgency");
  const tc = useTranslations("common");
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    api<{ agencies: Agency[] }>("/api/me").then((r) => {
      if (r.status === 401) return void (window.location.href = `/login${window.location.search}`);
      setAgencies(r.ok ? r.data.agencies : []);
    });
  }, []);

  async function choose(agencyId: string) {
    setError(null);
    setPending(agencyId);
    const sel = await api("/api/oauth/select-agency", { body: { agencyId } });
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
      {agencies?.length === 0 && <Alert>{t("none")}</Alert>}
      {agencies?.map((a) => (
        <Button key={a.agencyId} variant="outline" disabled={pending !== null} onClick={() => choose(a.agencyId)}>
          {a.name}
        </Button>
      ))}
      {error && <Alert variant="destructive">{error}</Alert>}
    </AuthCard>
  );
}
