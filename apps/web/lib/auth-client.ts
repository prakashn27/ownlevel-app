import { createAuthClient } from "better-auth/react";
import { oneTimeTokenClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

// No baseURL: calls go to the current origin's /api/auth (proxied to the API), so every agency
// host gets its own first-party session. oauthProviderClient attaches the signed OAuth query
// (from the page URL) to sign-in / consent / continue requests during an MCP authorization.
export const authClient = createAuthClient({ plugins: [oneTimeTokenClient(), oauthProviderClient()] });
