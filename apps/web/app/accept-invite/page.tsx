import { notFound } from "next/navigation";
import { getHostInfo } from "../../lib/server-api";
import AcceptInvite from "./accept-invite";

// Invitations are accepted on the agency's own host, which carries its branding.
export default async function Page() {
  if ((await getHostInfo()).kind !== "agency") notFound();
  return <AcceptInvite />;
}
