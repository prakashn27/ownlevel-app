import { z } from "zod";
import {
  createCalendar,
  createClient,
  DomainError,
  getCalendar,
  getClientTimezone,
  getSlots,
  listAppointments,
  listCalendars,
  listClients,
  localDateTime,
  localDaysRange,
  updateBrandColor,
  type Db,
} from "@ownlevel/core";

export { bookingTools, type BookingContext, type BookingTool } from "./booking";

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

/** The client a call acts on: fixed by a client-level connection (any client_id argument is ignored); an agency connection must name one. */
function clientScope(ctx: ToolContext, clientId?: string) {
  const id = ctx.level === "client" ? ctx.clientId : clientId;
  if (!id) throw new DomainError("invalid_input", "client_id is required: pick one with clients_list.");
  return { userId: ctx.userId, agencyId: ctx.agencyId, clientId: id };
}

const clientIdArg = z.string().optional().describe("Client id from clients_list. Required for agency connections, ignored for client connections.");
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").describe("First local day, YYYY-MM-DD, in the client's timezone");
const dayCount = z.number().int().min(1).max(31).optional().describe("Number of days from date (default 1)");

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
  defineTool({
    name: "calendars_list",
    description: "List the client's calendars (the services people can book), excluding archived ones.",
    permission: "calendars:read",
    scope: "appointments:read",
    levels: ["agency", "client"],
    sensitivity: "normal",
    input: z.object({ client_id: clientIdArg }),
    run: async (ctx, a) => {
      const { items } = await listCalendars(ctx.db, clientScope(ctx, (a as { client_id?: string }).client_id));
      return items.map((c) => ({ id: c.id, name: c.name, type: c.type, status: c.status, timezone: c.timezone, duration_min: c.duration_min, hosts: c.hosts }));
    },
  }),
  defineTool({
    name: "appointments_list",
    description:
      "List the client's booked and completed appointments on local days, all hosts by default. Times are returned in the client's timezone (local_start, local_end).",
    permission: "calendars:read",
    scope: "appointments:read",
    levels: ["agency", "client"],
    sensitivity: "normal",
    input: z.object({
      client_id: clientIdArg,
      date: localDate,
      days: dayCount,
      mine: z.boolean().optional().describe("Only appointments the signed-in user hosts"),
      calendar_id: z.string().optional(),
    }),
    run: async (ctx, a) => {
      const args = a as { client_id?: string; date: string; days?: number; mine?: boolean; calendar_id?: string };
      const scope = clientScope(ctx, args.client_id);
      const timezone = await getClientTimezone(ctx.db, scope);
      const { from, to } = localDaysRange(args.date, args.days ?? 1, timezone);
      const { items, next_cursor } = await listAppointments(ctx.db, scope, {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        status: "booked,completed",
        calendarId: args.calendar_id,
        hostId: args.mine ? ctx.userId : undefined,
      });
      return {
        timezone,
        appointments: items.map((i) => ({ ...i, local_start: localDateTime(Date.parse(i.starts_at), timezone), local_end: localDateTime(Date.parse(i.ends_at), timezone) })),
        truncated: next_cursor !== null,
      };
    },
  }),
  defineTool({
    name: "slots_find",
    description: "Open booking times of one calendar on local days, in the calendar's timezone.",
    permission: "calendars:read",
    scope: "appointments:read",
    levels: ["agency", "client"],
    sensitivity: "normal",
    input: z.object({ client_id: clientIdArg, calendar_id: z.string().describe("Calendar id from calendars_list"), date: localDate, days: dayCount }),
    run: async (ctx, a) => {
      const args = a as { client_id?: string; calendar_id: string; date: string; days?: number };
      const scope = clientScope(ctx, args.client_id);
      const { timezone } = await getCalendar(ctx.db, scope, args.calendar_id);
      const { from, to } = localDaysRange(args.date, args.days ?? 1, timezone);
      const r = await getSlots(ctx.db, scope, args.calendar_id, { from: new Date(from).toISOString(), to: new Date(to).toISOString() });
      return { timezone, slots: r.slots.map((s) => ({ starts_at: s.start, local_start: localDateTime(Date.parse(s.start), timezone), seats_left: s.seatsLeft })) };
    },
  }),
];

/** Coarse visibility filter for tools/list (level + scope). Role is enforced in core on every call. */
export const visibleTools = (ctx: ToolContext) => tools.filter((t) => t.levels.includes(ctx.level) && ctx.scopes.includes(t.scope));

/** Unknown, hidden and out-of-scope tools are indistinguishable: no existence leak. */
export function findTool(ctx: ToolContext, name: string) {
  return visibleTools(ctx).find((t) => t.name === name);
}
