import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: pages are dynamic (host-based branding), nothing is ISR-cached.
export default defineCloudflareConfig();
