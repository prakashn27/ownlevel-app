import { proxyToApi as proxy } from "@/lib/api-proxy";

export const dynamic = "force-dynamic";

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
