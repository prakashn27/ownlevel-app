import { proxyToApi as proxy } from "@/lib/api-proxy";

// OAuth discovery (RFC 8414) is served by the API at the origin root; forward it like /api/*.
export const dynamic = "force-dynamic";

export { proxy as GET, proxy as HEAD };
