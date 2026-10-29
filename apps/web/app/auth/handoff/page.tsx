"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { AuthCard } from "../../../components/auth-card";
import { authClient } from "../../../lib/auth-client";

// Exchanges a one-time token (minted on the platform host) for a session on this host.
function Handoff() {
  const t = useTranslations("auth.handoff");
  const tl = useTranslations("auth");
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return router.replace("/login");
    authClient.oneTimeToken.verify({ token }).then((r) => {
      if (r.error) setFailed(true);
      else router.replace("/dashboard");
    });
  }, [token, router]);

  return failed ? <p>{t("expired")} <a href="/login">{tl("signIn")}</a></p> : <p>{t("signingIn")}</p>;
}

export default function Page() {
  return <AuthCard><Suspense><Handoff /></Suspense></AuthCard>;
}
