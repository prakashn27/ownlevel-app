import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "../../components/auth-card";
import { PortalShell } from "../../components/portal-shell";
import { getHostInfo } from "../../lib/server-api";
import { PlatformDashboard } from "./platform-dashboard";

export default async function Dashboard() {
  const info = await getHostInfo();
  const t = await getTranslations();
  if (info.kind === "unknown") return <AuthCard><p>{t("common.notFound")}</p></AuthCard>;
  if (info.kind === "platform") return <PlatformDashboard />;
  return (
    <PortalShell>
      <h1>{t("dashboard.welcome", { name: info.branding.appName ?? info.name })}</h1>
      <p><Link href="/clients">{t("dashboard.viewClients", { labelLower: (info.branding.clientLabel ?? t("common.defaultClientLabel")).toLowerCase() })}</Link></p>
    </PortalShell>
  );
}
