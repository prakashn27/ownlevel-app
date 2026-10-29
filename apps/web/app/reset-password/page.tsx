"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "../../components/auth-card";
import { authClient } from "../../lib/auth-client";

function Form() {
  const t = useTranslations("auth.reset");
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) return <p className="text-sm text-destructive">{t("invalidLink")} <Link href="/forgot-password">{t("requestNew")}</Link>.</p>;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setError(t("mismatch"));
    setPending(true);
    const res = await authClient.resetPassword({ newPassword: String(f.get("password")), token: token! });
    setPending(false);
    if (res.error) return setError(t("expired"));
    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input name="password" type="password" placeholder={t("newPassword")} minLength={8} required />
      <Input name="confirm" type="password" placeholder={t("confirmPassword")} minLength={8} required />
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button disabled={pending}>{t("submit")}</Button>
    </form>
  );
}

export default function ResetPassword() {
  const t = useTranslations("auth.reset");
  return (
    <AuthCard title={t("title")}>
      <Suspense><Form /></Suspense>
    </AuthCard>
  );
}
