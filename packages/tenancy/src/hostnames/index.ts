/** Pure hostname + slug rules. No I/O; safe to use from web, api and workers. */

export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "mcp", "admin", "auth", "login", "mail", "status", "docs",
  "support", "domains", "agency", "platform", "ownlevel",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

export function validateSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3-40 lowercase letters, digits or hyphens; start and end with a letter or digit.";
  if (RESERVED_SLUGS.has(slug)) return "This name is reserved.";
  return null;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Lowercase, strip port and trailing dot. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export type HostConfig = {
  /** e.g. "ownlevel.app" (prod) or "localhost" (dev). Agencies live at {slug}.{rootDomain}. */
  rootDomain: string;
  /** Hosts that serve the platform itself (signup for agency owners), e.g. "app.ownlevel.app", "localhost". */
  platformHosts: string[];
};

export type ParsedHost =
  | { kind: "platform"; host: string }
  | { kind: "subdomain"; host: string; slug: string }
  | { kind: "custom"; host: string };

export function parseHost(rawHost: string, cfg: HostConfig): ParsedHost {
  const host = normalizeHost(rawHost);
  if (cfg.platformHosts.map(normalizeHost).includes(host)) return { kind: "platform", host };
  const suffix = `.${normalizeHost(cfg.rootDomain)}`;
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    if (!slug.includes(".") && validateSlug(slug) === null) return { kind: "subdomain", host, slug };
  }
  return { kind: "custom", host };
}

export function subdomainHost(slug: string, cfg: Pick<HostConfig, "rootDomain">): string {
  return `${slug}.${normalizeHost(cfg.rootDomain)}`;
}
