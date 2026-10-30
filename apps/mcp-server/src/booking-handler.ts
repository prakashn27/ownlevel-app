import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DomainError, resolveAiTarget, type Db } from "@ownlevel/core";
import { bookingTools } from "@ownlevel/ai/tools";

/** Rate limits of the public endpoint. Keys are per client, not per IP: assistants share their provider's IPs. */
export type BookingLimit = (limiter: "client" | "book", key: string) => Promise<boolean>;

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) }],
  isError,
});

const plain = (status: number, body: string) => new Response(body, { status });

/**
 * Public booking endpoint: `/book/{agency}/{client}/mcp`. No token, because the visitor has no account; what is
 * reachable is exactly what the client switched on. Everything off or missing is the same 404, so nothing about
 * the agency or its clients leaks.
 */
export function createBookingHandler(deps: { db: Db; limit?: BookingLimit }) {
  return async (req: Request, agencySlug: string, clientSlug: string): Promise<Response> => {
    const key = `${agencySlug}/${clientSlug}`.toLowerCase();
    if (deps.limit && !(await deps.limit("client", key))) return plain(429, "Too many requests. Please wait a moment and try again.");

    let target;
    try {
      target = await resolveAiTarget(deps.db, agencySlug, clientSlug);
    } catch (e) {
      if (e instanceof DomainError && e.code === "not_found") return plain(404, "Not found");
      console.error("booking mcp resolve failed", e);
      return plain(500, "Something went wrong.");
    }
    const ctx = { db: deps.db, target };

    const server = new Server({ name: target.client.name, version: "0.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: bookingTools.map((t) => ({ name: t.name, description: t.description, annotations: t.annotations, inputSchema: z.toJSONSchema(t.input) as { type: "object" } })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (call) => {
      const tool = bookingTools.find((t) => t.name === call.params.name);
      if (!tool) return textResult(`Tool not found: ${call.params.name}`, true);
      const parsed = tool.input.safeParse(call.params.arguments ?? {});
      if (!parsed.success) return textResult(`Invalid arguments: ${z.prettifyError(parsed.error)}`, true);
      if (!tool.annotations.readOnlyHint && deps.limit && !(await deps.limit("book", key))) return textResult("Too many booking attempts. Please wait a minute and try again.", true);
      try {
        const result = await tool.run(ctx, parsed.data as never);
        console.log(`audit public client=${target.client.id} tool=${tool.name} ok`);
        return textResult(result);
      } catch (e) {
        console.log(`audit public client=${target.client.id} tool=${tool.name} error`);
        if (e instanceof DomainError) return textResult(e.message, true);
        console.error("booking tool failed", e);
        return textResult("Something went wrong.", true);
      }
    });

    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(req);
  };
}
