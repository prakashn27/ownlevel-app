import { notFound } from "next/navigation";
import { PortalShell } from "../../components/portal-shell";
import { getHostInfo } from "../../lib/server-api";
import { ClientsPanel } from "./clients-panel";

export default async function Page() {
  const info = await getHostInfo();
  if (info.kind !== "agency") notFound();
  return <PortalShell><ClientsPanel label={info.branding.clientLabel ?? "Client"} /></PortalShell>;
}
