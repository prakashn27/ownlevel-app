"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "../../lib/auth-client";

export default function Dashboard() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session) return <p>Loading…</p>;

  return (
    <>
      <h1>Hello, {session.user.name}</h1>
      <p>{session.user.email}</p>
      <button onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</button>
    </>
  );
}
