"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
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
    <div className="narrow">
      <h1>Reset your password</h1>
      {sent ? (
        <p>If that email has an account here, we’ve sent a reset link. It expires in 1 hour.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <input name="email" type="email" placeholder="Email" required />
          <button disabled={pending}>Send reset link</button>
        </form>
      )}
      <p><Link href="/login">Back to sign in</Link></p>
    </div>
  );
}
