import { z } from "zod";
import { updateBrandColor, type Db } from "@ownlevel/core";

/** Verified by the MCP server from the OAuth token + live DB state; tools never see raw tokens. */
export type ToolContext = {
  db: Db;
  userId: string;
  agencyId: string;
  /** Installation level chosen at consent. */
  level: "agency" | "client";
  clientId?: string;
  /** OAuth scopes granted to the token. */
  scopes: string[];
};

export type ToolDef<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  /** role_permissions key; enforced again by core (requireRole) on every call. */
  permission: string;
  /** OAuth scope the token must carry. */
  scope: string;
  levels: ToolContext["level"][];
  sensitivity: "normal" | "outbound" | "destructive";
  input: S;
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>;
};

const defineTool = <S extends z.ZodObject>(t: ToolDef<S>) => t as unknown as ToolDef;

export const tools: ToolDef[] = [
  defineTool({
    name: "agency_set_brand_color",
    description: "Set the agency's primary brand color. Other branding fields are left unchanged.",
    permission: "agency:settings",
    scope: "agency:settings",
    levels: ["agency"],
    sensitivity: "normal",
    input: z.object({ primaryColor: z.string().describe("Hex color like #4f46e5") }),
    run: (ctx, args) => updateBrandColor(ctx.db, ctx, (args as { primaryColor: string }).primaryColor),
  }),
];

/** Coarse visibility filter for tools/list (level + scope). Role is enforced in core on every call. */
export const visibleTools = (ctx: ToolContext) => tools.filter((t) => t.levels.includes(ctx.level) && ctx.scopes.includes(t.scope));

/** Unknown, hidden and out-of-scope tools are indistinguishable: no existence leak. */
export function findTool(ctx: ToolContext, name: string) {
  return visibleTools(ctx).find((t) => t.name === name);
}
