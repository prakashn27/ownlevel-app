"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { authClient } from "../../lib/auth-client";
import { api } from "../../lib/api";

type Preview = { agencyName: string; email: string; roleName: string; hasAccount: boolean };

function Flow() {
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
    if (res.error) { setPending(false); return setError(res.error.message ?? "Something went wrong"); }
    await accept();
    setPending(false);
  }

  if (invalid) return <p className="error">This invitation is invalid or has expired. Ask your admin to send a new one.</p>;
  if (!preview || sessionPending) return <p>Loading…</p>;

  const signedInAsInvitee = session?.user.email.toLowerCase() === preview.email;

  return (
    <>
      <p>You’ve been invited to <b>{preview.agencyName}</b> as <b>{preview.roleName}</b>.</p>
      {signedInAsInvitee ? (
        <>
          {error && <p className="error">{error}</p>}
          <button onClick={accept}>Accept invitation</button>
        </>
      ) : (
        <>
          {session && (
            <p className="hint">
              You’re signed in as {session.user.email}. This invitation is for {preview.email}.{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); void authClient.signOut().then(() => router.refresh()); }}>Sign out</a>
            </p>
          )}
          <form onSubmit={onSubmit}>
            <input value={preview.email} readOnly />
            {!preview.hasAccount && <input name="name" placeholder="Your name" required />}
            <input name="password" type="password" minLength={8} required
              placeholder={preview.hasAccount ? "Your password" : "Choose a password"} />
            {error && <p className="error">{error}</p>}
            <button disabled={pending}>{preview.hasAccount ? "Sign in and accept" : "Create account and accept"}</button>
          </form>
        </>
      )}
    </>
  );
}

export default function AcceptInvite() {
  return (
    <div className="narrow">
      <h1>Join your team</h1>
      <Suspense><Flow /></Suspense>
    </div>
  );
}
