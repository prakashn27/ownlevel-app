import { createAuthClient } from "better-auth/react";
import { oneTimeTokenClient } from "better-auth/client/plugins";

// No baseURL: calls go to the current origin's /api/auth (proxied to the API), so every agency
// host gets its own first-party session.
export const authClient = createAuthClient({ plugins: [oneTimeTokenClient()] });
