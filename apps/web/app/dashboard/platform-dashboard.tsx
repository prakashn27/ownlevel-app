"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthCard } from "../../components/auth-card";
import { authClient } from "../../lib/auth-client";
import { api, onHost } from "../../lib/api";

type Me = {
  name: string;
  email: string;
  agencies: { agencyId: string; name: string; slug: string; hostname: string | null }[];
};

/** Platform host: no agency yet -> onboarding; otherwise list the user's agencies. */
export function PlatformDashboard() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;
    api<Me>("/api/me").then((r) => {
      if (!r.ok) return;
      setMe(r.data);
      if (r.data.agencies.length === 0) router.replace("/onboarding");
    });
  }, [session, router]);

  if (isPending || !session || !me) return <AuthCard><p>Loading…</p></AuthCard>;

  return (
    <AuthCard title={`Hello, ${me.name}`}>
      <p className="text-sm text-muted-foreground">{me.email}</p>
      <h2 className="!m-0">Your agencies</h2>
      <ul className="list-disc pl-5 text-sm">
        {me.agencies.map((a) => (
          <li key={a.agencyId}>{a.hostname ? <a href={onHost(a.hostname, "/login")}>{a.name}</a> : a.name}</li>
        ))}
      </ul>
      <p className="text-sm"><a href="/onboarding">Create another agency</a></p>
      <Button variant="secondary" onClick={() => authClient.signOut().then(() => router.push("/login"))}>Sign out</Button>
    </AuthCard>
  );
}
