import Link from "next/link";
import { AuthCard } from "../../components/auth-card";
import { PortalShell } from "../../components/portal-shell";
import { getHostInfo } from "../../lib/server-api";
import { PlatformDashboard } from "./platform-dashboard";

export default async function Dashboard() {
  const info = await getHostInfo();
  if (info.kind === "unknown") return <AuthCard><p>Not found.</p></AuthCard>;
  if (info.kind === "platform") return <PlatformDashboard />;
  return (
    <PortalShell>
      <h1>Welcome to {info.branding.appName ?? info.name}</h1>
      <p><Link href="/clients">View your {(info.branding.clientLabel ?? "Client").toLowerCase()}s</Link></p>
    </PortalShell>
  );
}
