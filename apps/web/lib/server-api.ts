import "server-only";
import { headers } from "next/headers";

export const API_URL = process.env.API_URL ?? "http://localhost:4000";
export const PROXY_SECRET = process.env.PROXY_SHARED_SECRET ?? "dev-proxy-secret-change-me";

export type HostInfo =
  | { kind: "platform" }
  | {
      kind: "agency";
      agencyId: string;
      name: string;
      slug: string;
      branding: { appName?: string; logoUrl?: string; primaryColor?: string; clientLabel?: string };
    }
  | { kind: "unknown" };

/** Resolves the browser-facing host to a tenant. Server-side only; the host is never user input. */
export async function getHostInfo(): Promise<HostInfo> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return { kind: "unknown" };
  const res = await fetch(`${API_URL}/api/host`, {
    headers: { "x-ownlevel-proxy": PROXY_SECRET, "x-forwarded-host": host },
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return { kind: "unknown" };
  return (await res.json()) as HostInfo;
}
