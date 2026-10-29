/**
 * End-to-end OAuth check against running servers (API :4000, MCP :4100, Postgres).
 * Plays the roles of the browser and an MCP client: sign up, create an agency, register a client (DCR),
 * authorize with PKCE, pick the agency, consent, exchange the code, then call the MCP server with the token.
 * Usage: pnpm --filter @ownlevel/mcp-server test:oauth
 */
import { createHash, randomBytes } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:4000";
const MCP = process.env.MCP_URL ?? "http://localhost:4100/mcp";
const WEB = process.env.WEB_URL ?? "http://localhost:3100";
const REDIRECT = "http://127.0.0.1:9999/callback";
const run = Date.now();
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

const jar = new Map<string, string>();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function http(url: string, init: RequestInit & { json?: unknown } = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: { origin: WEB, cookie: cookie(), ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    jar.set(pair!.slice(0, i), pair!.slice(i + 1));
  }
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, location: res.headers.get("location"), res };
}
const rpc = (token: string, method: string, params?: unknown) =>
  fetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) as any }));

// 1. a user with an agency
const email = `oauth-${run}@e2e.test`;
let r = await http(`${API}/api/auth/sign-up/email`, { method: "POST", json: { email, password: "password123", name: "OAuth E2E" } });
check("sign up", r.status === 200, r.body);
r = await http(`${API}/api/agencies`, { method: "POST", json: { name: `E2E ${run}`, slug: `e2e-${run}` } });
check("agency created", r.status === 201, r.body);
const agencyId = r.body.id as string;

// 2. discovery
const prm = await fetch(`${MCP.replace(/\/mcp$/, "")}/.well-known/oauth-protected-resource/mcp`).then((x) => x.json());
const as = await fetch(`${prm.authorization_servers[0].replace("/api/auth", "")}/.well-known/oauth-authorization-server/api/auth`).then((x) => x.json());
check("discovery: resource -> issuer -> endpoints", as.issuer === prm.authorization_servers[0] && !!as.authorization_endpoint, { prm, as });

// 3. dynamic client registration
r = await http(as.registration_endpoint, { method: "POST", json: { client_name: "E2E Client", application_type: "native", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], scope: "agency:settings offline_access" } });
check("client registered", r.status < 300 && !!r.body.client_id, r.body);
const clientId = r.body.client_id as string;

// 4. authorize (PKCE); logged in, so the server sends us to the agency picker
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, scope: "agency:settings offline_access", state: "xyz", code_challenge: challenge, code_challenge_method: "S256", resource: prm.resource });
r = await http(`${as.authorization_endpoint}?${q}`);
// Better Auth answers with a 302 for navigations and `{ redirect, url }` for fetches.
const nextUrl = (x: { location: string | null; body: any }) => x.location ?? x.body?.url ?? "";
check("authorize -> agency picker", nextUrl(r).startsWith(`${WEB}/oauth/select-agency`), { s: r.status, u: nextUrl(r) });
let oauthQuery = new URL(nextUrl(r)).search.slice(1);

// 5. pick the agency, continue
r = await http(`${API}/api/oauth/select-agency`, { method: "POST", json: { agencyId } });
check("agency selected", r.status === 200, r.body);
r = await http(`${API}/api/oauth/select-agency`, { method: "POST", json: { agencyId: "00000000-0000-0000-0000-000000000000" } });
check("cannot select an agency you don't belong to", r.status === 404, r.body);
r = await http(`${API}/api/auth/oauth2/continue`, { method: "POST", json: { postLogin: true, oauth_query: oauthQuery } });
check("continue -> consent", r.status === 200 && String(r.body.url).startsWith(`${WEB}/oauth/consent`), r.body);
oauthQuery = new URL(r.body.url).search.slice(1);

// 6. consent -> code
r = await http(`${API}/api/auth/oauth2/consent`, { method: "POST", json: { accept: true, oauth_query: oauthQuery } });
const cb = r.body?.url ? new URL(r.body.url) : null;
check("consent -> redirect with code", !!cb?.searchParams.get("code") && cb.origin + cb.pathname === REDIRECT && cb.searchParams.get("state") === "xyz", r.body);

// 7. token
r = await http(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: cb!.searchParams.get("code")!, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: prm.resource }).toString() });
check("token issued", !!r.body.access_token, r.body);
const token = r.body.access_token as string;
const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
check("token claims: aud=resource, agency_id, scope", claims.aud === prm.resource || claims.aud?.includes?.(prm.resource), claims);
check("token carries agency_id", claims.agency_id === agencyId, claims);

// 8. MCP with the token
let m = await rpc(token, "tools/list");
check("tools/list shows agency_set_brand_color", m.body?.result?.tools?.some((t: any) => t.name === "agency_set_brand_color"), m);
m = await rpc(token, "tools/call", { name: "agency_set_brand_color", arguments: { primaryColor: "#0ea5e9" } });
check("tools/call sets color", m.body?.result?.isError === false && m.body.result.content[0].text.includes("#0ea5e9"), m);
m = await rpc("not-a-token", "tools/list");
check("garbage token -> 401", m.status === 401, m);
m = await rpc("", "tools/list");
check("no token -> 401", m.status === 401, m);

// 9. refresh
if (r.body.refresh_token) {
  const rr = await http(as.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: r.body.refresh_token, client_id: clientId, resource: prm.resource }).toString() });
  check("refresh token works", !!rr.body.access_token, rr.body);
}
// 10. revocation: losing the membership stops a still-valid token immediately (needs a DB owner connection)
const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://ownlevel:ownlevel@localhost:5432/ownlevel" });
await pool.query("delete from memberships where agency_id = $1", [agencyId]);
m = await rpc(token, "tools/list");
check("membership removed -> same token rejected", m.status === 401, m);

// cleanup: leave no test data behind
await pool.query("delete from agencies where id = $1", [agencyId]);
await pool.query('delete from "user" where email = $1', [email]);
await pool.end();
process.exit(failed ? 1 : 0);
