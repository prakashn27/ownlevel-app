import { notFound } from "next/navigation";
import { PortalShell } from "../../../components/portal-shell";
import { getHostInfo } from "../../../lib/server-api";
import { BrandingForm } from "./branding-form";

export default async function Page() {
  const info = await getHostInfo();
  if (info.kind !== "agency") notFound();
  return (
    <PortalShell>
      <BrandingForm agencyName={info.name} initial={info.branding} />
    </PortalShell>
  );
}
