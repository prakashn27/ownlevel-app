"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthCard } from "../../components/auth-card";
import { authClient } from "../../lib/auth-client";
import { onHost } from "../../lib/api";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const ROOT = process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? "localhost";

export default function Onboarding() {
  const t = useTranslations("onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ name: string; hostname: string } | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    setAvailable(null);
    if (slug.length < 3) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/slugs/${encodeURIComponent(slug)}`);
      if (r.ok) setAvailable((await r.json()).available);
    }, 300);
    return () => clearTimeout(t);
  }, [slug]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/agencies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, timezone: f.get("timezone"), currency: f.get("currency") }),
    });
    setPending(false);
    const body = await res.json();
    if (!res.ok) return setError(body.message ?? tc("somethingWentWrong"));
    // Sessions are host-bound: mint a one-time token so the owner lands signed in on the new host.
    const ott = await authClient.oneTimeToken.generate();
    if (ott.data?.token) {
      window.location.href = onHost(body.hostname, `/auth/handoff?token=${encodeURIComponent(ott.data.token)}`);
      return;
    }
    setCreated(body);
  }

  if (isPending || !session) return <AuthCard><p>{tc("loading")}</p></AuthCard>;

  if (created) {
    const { protocol, port } = window.location;
    const url = `${protocol}//${created.hostname}${port ? `:${port}` : ""}/login`;
    return (
      <AuthCard title={t("ready", { name: created.name })}>
        <p>{t("livesAt")}</p>
        <p><a href={url}>{created.hostname}</a></p>
        <p className="text-sm text-muted-foreground">{t("signInThere")}</p>
      </AuthCard>
    );
  }

  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  return (
    <AuthCard title={t("title")}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("agencyName")} required minLength={2} />
        <div className="flex flex-col gap-1.5">
          <Input
            value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
            placeholder={t("slugPlaceholder")}
            required
          />
          <p className="text-xs text-muted-foreground">
            {slug || t("slugPlaceholder")}.{ROOT}
            {available === true && ` · ${t("available")}`}
            {available === false && ` · ${t("notAvailable")}`}
          </p>
        </div>
        <Input name="timezone" defaultValue={tz} placeholder={t("timezone")} required />
        <Input name="currency" defaultValue="USD" placeholder={t("currency")} maxLength={3} required />
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button disabled={pending || available === false}>{t("create")}</Button>
      </form>
    </AuthCard>
  );
}
