/** The slice of an R2 bucket the MCP server uses. */
export type LogoBucket = { get(key: string): Promise<{ body: ReadableStream; httpEtag: string; httpMetadata?: { contentType?: string } } | null> };

const FILE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/logo-\d+\.(png|jpg|webp)$/;

/** Public address of an uploaded logo. Keys never change once written, so URLs are cacheable forever. */
export const logoUrl = (origin: string, key: string) => `${origin}/logos/${key}`;

/** `icons` for the MCP server info: the client's uploaded logo, else the agency's configured logo URL. */
export function serverIcons(origin: string, id: { logoKey: string | null; logoUrl: string | null }) {
  const src = id.logoKey ? logoUrl(origin, id.logoKey) : id.logoUrl;
  return src ? [{ src }] : undefined;
}

/** GET /logos/{agencyId}/{clientId}/logo-{timestamp}.{ext}: public, image only. */
export async function serveLogo(bucket: LogoBucket | undefined, key: string): Promise<Response> {
  if (!bucket || !FILE.test(key)) return new Response("Not found", { status: 404 });
  const obj = await bucket.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      etag: obj.httpEtag,
    },
  });
}
