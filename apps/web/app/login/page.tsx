import { AuthForm } from "../auth-form";
import { getHostInfo } from "../../lib/server-api";

export default async function Page() {
  const info = await getHostInfo();
  if (info.kind === "unknown") return <p>Not found.</p>;
  return <AuthForm mode="login" allowSignup={info.kind === "platform"} />;
}
