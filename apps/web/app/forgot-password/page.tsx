"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "../../components/auth-card";
import { authClient } from "../../lib/auth-client";

export default function ForgotPassword() {
  const t = useTranslations("auth.forgot");
  const tc = useTranslations("common");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    // The answer is always the same, so nobody can probe which emails have accounts.
    await authClient.requestPasswordReset({ email });
    setPending(false);
    setSent(true);
  }

  return (
    <AuthCard title={t("title")}>
      {sent ? (
        <p>{t("sent")}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input name="email" type="email" placeholder={tc("emailPlaceholder")} required />
          <Button disabled={pending}>{t("send")}</Button>
        </form>
      )}
      <p className="text-sm"><Link href="/login">{t("back")}</Link></p>
    </AuthCard>
  );
}
