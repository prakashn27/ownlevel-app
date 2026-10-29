"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../../lib/auth-client";
import { onHost } from "../../lib/api";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const ROOT = process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? "localhost";

export default function Onboarding() {
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
    if (!res.ok) return setError(body.message ?? "Something went wrong");
    // Sessions are host-bound: mint a one-time token so the owner lands signed in on the new host.
    const ott = await authClient.oneTimeToken.generate();
    if (ott.data?.token) {
      window.location.href = onHost(body.hostname, `/auth/handoff?token=${encodeURIComponent(ott.data.token)}`);
      return;
    }
    setCreated(body);
  }

  if (isPending || !session) return <div className="narrow"><p>Loading…</p></div>;

  if (created) {
    const { protocol, port } = window.location;
    const url = `${protocol}//${created.hostname}${port ? `:${port}` : ""}/login`;
    return (
      <div className="narrow">
        <h1>{created.name} is ready</h1>
        <p>Your agency portal lives at:</p>
        <p><a href={url}>{created.hostname}</a></p>
        <p className="hint">Sign in there with the same email and password. You can add your own domain later in Settings.</p>
      </div>
    );
  }

  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  return (
    <div className="narrow">
      <h1>Set up your agency</h1>
      <form onSubmit={onSubmit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agency name" required minLength={2} />
        <div>
          <input
            value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
            placeholder="your-agency"
            required
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          <p className="hint">
            {slug || "your-agency"}.{ROOT}
            {available === true && " · available"}
            {available === false && " · not available"}
          </p>
        </div>
        <input name="timezone" defaultValue={tz} placeholder="Timezone" required />
        <input name="currency" defaultValue="USD" placeholder="Currency" maxLength={3} required />
        {error && <p className="error">{error}</p>}
        <button disabled={pending || available === false}>Create agency</button>
      </form>
    </div>
  );
}
