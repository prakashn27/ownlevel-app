"use client";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "../../../lib/api";

export type Client = { id: string; name: string; timezone: string; currency: string; status: string; createdAt: string };

const Ctx = createContext<{ client: Client; label: string; reload: () => Promise<void> } | null>(null);
export const useClient = () => useContext(Ctx)!;

/** Loads the client once for all tabs. The API checks it belongs to the host's agency. */
export function ClientWorkspace({ clientId, label, children }: { clientId: string; label: string; children: ReactNode }) {
  const t = useTranslations();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api<Client>(`/api/clients/${clientId}`);
    if (r.ok) setClient(r.data);
    else setError(r.status === 404 ? t("client.notFound", { label }) : r.error);
  }, [clientId, label, t]);
  useEffect(() => { void reload(); }, [reload]);

  if (!client) return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">{t("common.loading")}</p>;

  return (
    <Ctx.Provider value={{ client, label, reload }}>
      <h1>{client.name}{client.status === "archived" && <Badge className="ml-2 align-middle">{t("common.archived")}</Badge>}</h1>
      {children}
    </Ctx.Provider>
  );
}
