/**
 * Fetch for Client ID Metadata Documents (and their jwks_uri) on Cloudflare Workers.
 *
 * The Node transport in @better-auth/cimd pins a validated DNS answer, which Workers cannot do. Here the
 * platform provides the isolation: Workers resolve and connect from Cloudflare's edge and cannot reach
 * private, loopback or link-local addresses. On top of that this refuses anything that is not a plain
 * public https hostname, never follows redirects, and bounds time and size.
 */
const TIMEOUT_MS = 5_000;
const MAX_BYTES = 64 * 1024;

function assertPublicHttps(url: URL) {
  if (url.protocol !== "https:") throw new TypeError("metadata URL must be https");
  if (url.username || url.password) throw new TypeError("metadata URL must not contain credentials");
  if (url.port && url.port !== "443") throw new TypeError("metadata URL must use the default https port");
  const host = url.hostname.toLowerCase();
  const isIp = /^[\d.]+$/.test(host) || host.includes(":"); // IPv4 or IPv6 literal
  if (isIp || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new TypeError("metadata URL must use a public hostname");
  }
}

export const fetchClientMetadataResource = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const req = new Request(input, init);
  if (req.method !== "GET" && req.method !== "HEAD") throw new TypeError("only GET and HEAD are supported");
  assertPublicHttps(new URL(req.url));

  const res = await fetch(req, { redirect: "manual", signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.body) return res;

  // Bound the body: stop reading past MAX_BYTES.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new TypeError("metadata document is too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
};
