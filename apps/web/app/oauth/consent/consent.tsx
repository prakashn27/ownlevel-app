"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const KNOWN_SCOPES = ["agency:settings", "offline_access"] as const;

/** MCP authorization step: the user approves (or denies) what the connecting app may do. */
export function Consent() {
  const t = useTranslations("oauth.consent");
  const tc = useTranslations("common");
  const [app, setApp] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setScopes((q.get("scope") ?? "").split(" ").filter(Boolean));
    const clientId = q.get("client_id");
    if (clientId) {
      authClient
        .$fetch<{ client_name?: string }>("/oauth2/public-client", { method: "GET", query: { client_id: clientId } })
        .then((r) => setApp(r.data?.client_name ?? ""));
    }
  }, []);

  async function answer(accept: boolean) {
    setError(null);
    setPending(true);
    const res = await authClient.$fetch<{ url?: string }>("/oauth2/consent", { method: "POST", body: { accept } });
    if (res.data?.url) return void (window.location.href = res.data.url);
    setPending(false);
    setError(res.error?.message ?? tc("somethingWentWrong"));
  }

  const appName = app || t("unknownApp");
  const label = (s: string) => ((KNOWN_SCOPES as readonly string[]).includes(s) ? t(`scope.${s as (typeof KNOWN_SCOPES)[number]}`) : t("unknownScope", { scope: s }));

  return (
    <AuthCard title={t("title", { app: appName })}>
      <p className="text-sm">{t.rich("description", { app: appName, b: (c) => <b>{c}</b> })}</p>
      <ul className="list-disc pl-5 text-sm">
        {scopes.map((s) => <li key={s}>{label(s)}</li>)}
      </ul>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => answer(true)}>{t("allow")}</Button>
        <Button variant="outline" disabled={pending} onClick={() => answer(false)}>{t("deny")}</Button>
      </div>
    </AuthCard>
  );
}
