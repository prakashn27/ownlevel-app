import { getTranslations } from "next-intl/server";
import { AuthForm } from "../auth-form";
import { getHostInfo } from "../../lib/server-api";

export default async function Page() {
  const info = await getHostInfo();
  const t = await getTranslations("common");
  if (info.kind === "unknown") return <p>{t("notFound")}</p>;
  return <AuthForm mode="login" allowSignup={info.kind === "platform"} />;
}
