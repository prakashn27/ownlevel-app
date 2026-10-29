"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { api } from "../../lib/api";
import { TimezoneSelect } from "@/components/ui/timezone-select";

type Client = { id: string; name: string; timezone: string; currency: string; status: string };

export function ClientsPanel({ label }: { label: string }) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const labelLower = label.toLowerCase();
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
      <h1>{t("title", { label })}</h1>
      <Card className="mb-6">
        <CardHeader><CardTitle>{t("new", { labelLower })}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Label>{t("name")}<Input name="name" required maxLength={120} /></Label>
            <div className="grid grid-cols-2 gap-3">
              <Label>{t("timezone")}<TimezoneSelect name="timezone" emptyLabel={t("agencyDefault")} /></Label>
              <Label>{t("currency")}<Input name="currency" placeholder={t("agencyDefault")} maxLength={3} /></Label>
            </div>
            <div><Button disabled={pending}>{t("create", { labelLower })}</Button></div>
          </form>
        </CardContent>
      </Card>
      {error && <Alert variant="destructive">{error}</Alert>}
      {clients && clients.length === 0 && <p className="text-muted-foreground">{t("empty", { labelLower })}</p>}
      {clients && clients.length > 0 && (
        <Table>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell><Link href={`/client/${c.id}`} className="font-medium">{c.name}</Link>{c.status === "archived" && <Badge className="ml-2">{tc("archived")}</Badge>}</TableCell>
                <TableCell className="text-muted-foreground">{c.timezone}</TableCell><TableCell className="text-muted-foreground">{c.currency}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
