import type { NextRequest } from "next/server";
import { API_URL, PROXY_SECRET } from "../../../lib/server-api";

// Same-origin proxy: the browser only ever talks to its own host, so cookies stay first-party
// and host-only, with no CORS. The API learns the real host from X-Forwarded-Host, which it
// trusts only together with the shared secret.
export const dynamic = "force-dynamic";

const FORWARD = ["cookie", "content-type", "accept", "accept-language", "user-agent", "origin", "authorization"];

async function proxy(req: NextRequest) {
  const url = new URL(req.url);
  const headers = new Headers();
  for (const name of FORWARD) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const host = req.headers.get("host") ?? url.host;
  headers.set("x-forwarded-host", host);
  headers.set("x-forwarded-proto", req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", ""));
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  if (ip) headers.set("x-forwarded-for", ip);
  headers.set("x-ownlevel-proxy", PROXY_SECRET);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(`${API_URL}${url.pathname}${url.search}`, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: "manual",
    // @ts-expect-error required by Node fetch for streamed request bodies
    duplex: "half",
  });

  const out = new Headers(upstream.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
