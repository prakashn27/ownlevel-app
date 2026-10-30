import { z } from "zod";
import { createCalendar, createClient, listClients, updateBrandColor, type Db } from "@ownlevel/core";

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
  defineTool({
    name: "clients_list",
    description: "List the agency's clients (id, name, timezone, currency, status).",
    permission: "clients:read",
    scope: "clients:read",
    levels: ["agency"],
    sensitivity: "normal",
    input: z.object({}),
    run: (ctx) => listClients(ctx.db, ctx),
  }),
  defineTool({
    name: "clients_create",
    description:
      "Create a client. Timezone and currency default to the agency's. With with_calendar, also creates a default draft calendar named after the client (weekdays 9:00-17:00, no host yet).",
    permission: "clients:write",
    scope: "clients:write",
    levels: ["agency"],
    sensitivity: "normal",
    input: z.object({
      name: z.string().describe("Client name"),
      timezone: z.string().optional().describe("IANA timezone like Europe/Paris"),
      currency: z.string().optional().describe("3-letter code like USD"),
      with_calendar: z.boolean().optional().describe("Also create a default calendar"),
    }),
    run: async (ctx, a) => {
      const args = a as { name: string; timezone?: string; currency?: string; with_calendar?: boolean };
      const client = await createClient(ctx.db, ctx, args);
      if (!args.with_calendar) return { client };
      // Separate transaction: if the calendar fails, the client stays and the caller is told.
      try {
        const calendar = await createCalendar(ctx.db, { ...ctx, clientId: client.id }, { type: "personal", name: client.name });
        return { client, calendar };
      } catch (e) {
        return { client, calendar: null, calendarError: e instanceof Error ? e.message : "Calendar was not created." };
      }
    },
  }),
  defineTool({
    name: "calendars_create",
    description: "Create a draft calendar for one of the agency's clients. Defaults: personal, 30 minutes, weekdays 9:00-17:00, no host yet.",
    permission: "calendars:write",
    scope: "calendars:write",
    levels: ["agency"],
    sensitivity: "normal",
    input: z.object({
      client_id: z.string().describe("Client id from clients_list"),
      name: z.string(),
      type: z.enum(["personal", "round_robin", "class", "collective"]).optional(),
      duration_min: z.number().int().optional(),
      capacity: z.number().int().optional().describe("Required for class calendars only"),
    }),
    run: (ctx, a) => {
      const { client_id, ...input } = a as { client_id: string; name: string; type?: string };
      // Core checks the client belongs to the token's agency and the caller's role.
      return createCalendar(ctx.db, { ...ctx, clientId: client_id }, { type: "personal", ...input });
    },
  }),
];

/** Coarse visibility filter for tools/list (level + scope). Role is enforced in core on every call. */
export const visibleTools = (ctx: ToolContext) => tools.filter((t) => t.levels.includes(ctx.level) && ctx.scopes.includes(t.scope));

/** Unknown, hidden and out-of-scope tools are indistinguishable: no existence leak. */
export function findTool(ctx: ToolContext, name: string) {
  return visibleTools(ctx).find((t) => t.name === name);
}
