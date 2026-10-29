import Link from "next/link";
import { PortalShell } from "../../components/portal-shell";
import { getHostInfo } from "../../lib/server-api";
import { PlatformDashboard } from "./platform-dashboard";

export default async function Dashboard() {
  const info = await getHostInfo();
  if (info.kind === "unknown") return <div className="narrow"><p>Not found.</p></div>;
  if (info.kind === "platform") return <PlatformDashboard />;
  return (
    <PortalShell>
      <h1>Welcome to {info.branding.appName ?? info.name}</h1>
      <p><Link href="/clients">View your {(info.branding.clientLabel ?? "Client").toLowerCase()}s</Link></p>
    </PortalShell>
  );
}
