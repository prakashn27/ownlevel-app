"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "../../components/auth-card";
import { authClient } from "../../lib/auth-client";

export default function ForgotPassword() {
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
    <AuthCard title="Reset your password">
      {sent ? (
        <p>If that email has an account here, we’ve sent a reset link. It expires in 1 hour.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input name="email" type="email" placeholder="Email" required />
          <Button disabled={pending}>Send reset link</Button>
        </form>
      )}
      <p className="text-sm"><Link href="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
