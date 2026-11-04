import { notFound } from "next/navigation";
import { PortalShell } from "../../../components/portal-shell";
import { getHostInfo } from "../../../lib/server-api";
import { BrandingForm } from "./branding-form";
import { CustomDomainGuide } from "./custom-domain-guide";
import { headers } from "next/headers";

export default async function Page() {
  const info = await getHostInfo();
  if (info.kind !== "agency") notFound();
  const host = (await headers()).get("host") ?? "";
  return (
    <PortalShell>
      <BrandingForm agencyName={info.name} initial={info.branding} />
      <CustomDomainGuide host={host} />
    </PortalShell>
  );
}
