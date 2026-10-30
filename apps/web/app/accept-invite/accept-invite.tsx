"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "../../components/auth-card";
import { authClient } from "../../lib/auth-client";
import { api } from "../../lib/api";

type Preview = { agencyName: string; email: string; roleName: string; hasAccount: boolean };

function Flow() {
  const t = useTranslations("invite");
  const tc = useTranslations("common");
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<Preview>(`/api/invitations/preview?token=${encodeURIComponent(token)}`).then((r) => (r.ok ? setPreview(r.data) : setInvalid(true)));
  }, [token]);

  async function accept() {
    const r = await api("/api/invitations/accept", { body: { token } });
    if (!r.ok) return setError(r.error);
    router.replace("/dashboard");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preview) return;
    setError(null); setPending(true);
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    const res = preview.hasAccount
      ? await authClient.signIn.email({ email: preview.email, password })
      : await authClient.signUp.email({ email: preview.email, password, name: String(f.get("name")) });
    if (res.error) { setPending(false); return setError(res.error.message ?? tc("somethingWentWrong")); }
    await accept();
    setPending(false);
  }

  if (invalid) return <p className="text-sm text-destructive">{t("invalid")}</p>;
  if (!preview || sessionPending) return <p>{tc("loading")}</p>;

  const signedInAsInvitee = session?.user.email.toLowerCase() === preview.email;

  return (
    <>
      <p>{t.rich("invitedAs", { agency: preview.agencyName, role: preview.roleName, b: (c) => <b>{c}</b> })}</p>
      {signedInAsInvitee ? (
        <>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button onClick={accept}>{t("accept")}</Button>
        </>
      ) : (
        <>
          {session && (
            <p className="text-sm text-muted-foreground">
              {t("signedInAs", { current: session.user.email, invited: preview.email })}{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); void authClient.signOut().then(() => router.refresh()); }}>{tc("signOut")}</a>
            </p>
          )}
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Input value={preview.email} readOnly />
            {!preview.hasAccount && <Input name="name" placeholder={t("yourName")} required />}
            <Input name="password" type="password" minLength={8} required
              placeholder={preview.hasAccount ? t("yourPassword") : t("choosePassword")} />
            {error && <Alert variant="destructive">{error}</Alert>}
            {preview.hasAccount && <p className="text-sm"><Link href="/forgot-password">{t("forgotPassword")}</Link></p>}
            <Button disabled={pending}>{preview.hasAccount ? t("signInAndAccept") : t("createAndAccept")}</Button>
          </form>
        </>
      )}
    </>
  );
}

export default function AcceptInvite() {
  const t = useTranslations("invite");
  return (
    <AuthCard title={t("title")}>
      <Suspense><Flow /></Suspense>
    </AuthCard>
  );
}
