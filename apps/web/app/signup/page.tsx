import { notFound } from "next/navigation";
import { AuthForm } from "../auth-form";
import { getHostInfo } from "../../lib/server-api";

// Open signup is for agency owners on the platform host only. On an agency host, people join by invite.
export default async function Page() {
  const info = await getHostInfo();
  if (info.kind !== "platform") notFound();
  return <AuthForm mode="signup" allowSignup />;
}
