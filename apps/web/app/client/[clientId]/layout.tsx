import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PortalShell } from "../../../components/portal-shell";
import { getHostInfo } from "../../../lib/server-api";
import { ClientWorkspace } from "./client-workspace";

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ clientId: string }> }) {
  const info = await getHostInfo();
  if (info.kind !== "agency") notFound();
  const { clientId } = await params;
  return (
    <PortalShell>
      <ClientWorkspace clientId={clientId} label={info.branding.clientLabel ?? "Client"}>{children}</ClientWorkspace>
    </PortalShell>
  );
}
