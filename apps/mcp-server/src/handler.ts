import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DomainError } from "@ownlevel/core";
import { findTool, visibleTools, type ToolContext } from "@ownlevel/ai/tools";

export type McpDeps = {
  /** Verify the Bearer token (Better Auth) and build the live context; null = unauthenticated. */
  authenticate: (req: Request) => Promise<ToolContext | null>;
  /** RFC 9728 protected-resource metadata URL, advertised on 401. */
  resourceMetadataUrl: string;
  /** Write audit_log (actor_user_id + app_installation_id). */
  audit?: (ctx: ToolContext, tool: string, outcome: "ok" | "error") => Promise<void>;
};

const textResult = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) }],
  isError,
});

/** Stateless Streamable HTTP: a fresh Server per request, context re-derived from the token every time. */
export function createMcpHandler(deps: McpDeps) {
  return async (req: Request): Promise<Response> => {
    const ctx = await deps.authenticate(req);
    if (!ctx) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": `Bearer resource_metadata="${deps.resourceMetadataUrl}"` },
      });
    }

    const server = new Server({ name: "ownlevel", version: "0.0.0" }, { capabilities: { tools: { listChanged: true } } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: visibleTools(ctx).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: z.toJSONSchema(t.input) as { type: "object" },
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (call) => {
      // Re-check on every call: listing is a convenience, not a boundary.
      const tool = findTool(ctx, call.params.name);
      if (!tool) return textResult(`Tool not found: ${call.params.name}`, true);
      if (tool.sensitivity !== "normal") return textResult("This tool requires human approval.", true); // TODO approval flow
      const parsed = tool.input.safeParse(call.params.arguments ?? {});
      if (!parsed.success) return textResult(`Invalid arguments: ${z.prettifyError(parsed.error)}`, true);
      try {
        const result = await tool.run(ctx, parsed.data);
        await deps.audit?.(ctx, tool.name, "ok");
        return textResult(result);
      } catch (e) {
        await deps.audit?.(ctx, tool.name, "error");
        // Role failures look like missing tools so nothing about the agency leaks.
        if (e instanceof DomainError) return textResult(e.code === "forbidden" ? `Tool not found: ${tool.name}` : e.message, true);
        console.error("mcp tool failed", e);
        return textResult("Something went wrong.", true);
      }
    });

    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(req);
  };
}
