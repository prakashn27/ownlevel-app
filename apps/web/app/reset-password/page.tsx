"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { authClient } from "../../lib/auth-client";

function Form() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) return <p className="error">This reset link is invalid. <Link href="/forgot-password">Request a new one</Link>.</p>;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setError("Passwords don’t match.");
    setPending(true);
    const res = await authClient.resetPassword({ newPassword: String(f.get("password")), token: token! });
    setPending(false);
    if (res.error) return setError("This link has expired or was already used.");
    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit}>
      <input name="password" type="password" placeholder="New password" minLength={8} required />
      <input name="confirm" type="password" placeholder="Confirm new password" minLength={8} required />
      {error && <p className="error">{error}</p>}
      <button disabled={pending}>Set new password</button>
    </form>
  );
}

export default function ResetPassword() {
  return (
    <div className="narrow">
      <h1>Choose a new password</h1>
      <Suspense><Form /></Suspense>
    </div>
  );
}
