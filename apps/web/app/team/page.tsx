import { notFound } from "next/navigation";
import { PortalShell } from "../../components/portal-shell";
import { getHostInfo } from "../../lib/server-api";
import { TeamPanel } from "./team-panel";

export default async function Page() {
  if ((await getHostInfo()).kind !== "agency") notFound();
  return <PortalShell><TeamPanel /></PortalShell>;
}
