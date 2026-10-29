"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "../../components/auth-card";
import { authClient } from "../../lib/auth-client";

function Form() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) return <p className="text-sm text-destructive">This reset link is invalid. <Link href="/forgot-password">Request a new one</Link>.</p>;

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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input name="password" type="password" placeholder="New password" minLength={8} required />
      <Input name="confirm" type="password" placeholder="Confirm new password" minLength={8} required />
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button disabled={pending}>Set new password</Button>
    </form>
  );
}

export default function ResetPassword() {
  return (
    <AuthCard title="Choose a new password">
      <Suspense><Form /></Suspense>
    </AuthCard>
  );
}
