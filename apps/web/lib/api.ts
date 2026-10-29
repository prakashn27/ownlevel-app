/** Same-origin JSON helper for the proxied API. */
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data.message ?? "Something went wrong") };
}

/** Absolute URL on another host, keeping the current protocol and dev port. */
export function onHost(hostname: string, path: string) {
  const { protocol, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ""}${path}`;
}
