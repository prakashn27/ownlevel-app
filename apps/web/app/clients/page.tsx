import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PortalShell } from "../../components/portal-shell";
import { getHostInfo } from "../../lib/server-api";
import { ClientsPanel } from "./clients-panel";

export default async function Page() {
  const info = await getHostInfo();
  const t = await getTranslations("common");
  if (info.kind !== "agency") notFound();
  return <PortalShell><ClientsPanel label={info.branding.clientLabel ?? t("defaultClientLabel")} /></PortalShell>;
}
