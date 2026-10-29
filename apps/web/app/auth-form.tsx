"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { AuthCard } from "../components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { authClient } from "../lib/auth-client";

export function AuthForm({ mode, allowSignup = true }: { mode: "login" | "signup"; allowSignup?: boolean }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const res =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: String(f.get("name")) })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (res.error) return setError(res.error.message ?? tc("somethingWentWrong"));
    // During an MCP authorization the server returns a redirect that continues the flow (the client follows it).
    if (res.data && "redirect" in res.data && res.data.redirect) return;
    router.push("/dashboard");
  }

  return (
    <AuthCard title={mode === "login" ? t("signIn") : t("createAccount")}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {mode === "signup" && <Input name="name" placeholder={t("namePlaceholder")} required />}
        <Input name="email" type="email" placeholder={tc("emailPlaceholder")} required />
        <Input name="password" type="password" placeholder={tc("passwordPlaceholder")} minLength={8} required />
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button disabled={pending}>{mode === "login" ? t("signIn") : t("signUp")}</Button>
      </form>
      {mode === "login" && <p className="text-sm"><Link href="/forgot-password">{t("forgotPassword")}</Link></p>}
      {(allowSignup || mode === "signup") && (
        <p className="text-sm">
          {mode === "login" ? <Link href="/signup">{t("createAgencyAccount")}</Link> : <Link href="/login">{t("haveAccount")}</Link>}
        </p>
      )}
    </AuthCard>
  );
}
