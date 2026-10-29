import { headers } from "next/headers";
import ico from "./favicon-data/favicon.ico";
import png32 from "./favicon-data/favicon-32x32.png";
import png16 from "./favicon-data/favicon-16x16.png";

/** The favicon is only served on the main app host; agency/custom domains get none. */
const FAVICON_HOST = "app.ownlevel.app";

export async function isFaviconHost(): Promise<boolean> {
  const host = (await headers()).get("host")?.toLowerCase().split(":")[0];
  return host === FAVICON_HOST;
}

const FILES = {
  "favicon.ico": { data: ico, type: "image/x-icon" },
  "favicon-32x32.png": { data: png32, type: "image/png" },
  "favicon-16x16.png": { data: png16, type: "image/png" },
} as const;

export async function faviconResponse(name: keyof typeof FILES): Promise<Response> {
  if (!(await isFaviconHost())) return new Response(null, { status: 404 });
  const { data, type } = FILES[name];
  return new Response(Buffer.from(data, "base64"), {
    headers: { "content-type": type, "cache-control": "public, max-age=86400", vary: "host" },
  });
}
