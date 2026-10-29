import { timingSafeEqual } from "node:crypto";
import { normalizeHost, type HostConfig } from "@ownlevel/tenancy";
import { env } from "./env.js";

export const hostConfig: HostConfig = { rootDomain: env.rootDomain, platformHosts: env.platformHosts };

function secretMatches(given: string | undefined) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.proxySecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The browser-facing host. X-Forwarded-Host is honoured only when the request carries
 * the proxy secret (i.e. it came through our web proxy); otherwise the Host header wins.
 */
export function requestHost(headers: Headers): { host: string; origin: string } {
  const trusted = secretMatches(headers.get("x-ownlevel-proxy") ?? undefined);
  const raw = (trusted && headers.get("x-forwarded-host")) || headers.get("host") || "";
  const host = normalizeHost(raw);
  const local = host === "localhost" || host.endsWith(".localhost");
  const proto = (trusted && headers.get("x-forwarded-proto")) || (local ? "http" : "https");
  return { host, origin: `${proto}://${raw}` };
}
