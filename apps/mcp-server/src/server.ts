// Local development only. Production runs as a Cloudflare Worker (src/worker.ts).
import { serve } from "@hono/node-server";
import { handle } from "./app.js";

const port = Number(process.env.MCP_PORT ?? 4100);
serve({ port, fetch: handle }, (i) => console.log(`mcp-server (local) listening on http://localhost:${i.port}/mcp`));
