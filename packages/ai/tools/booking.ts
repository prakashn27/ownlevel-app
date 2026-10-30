import { z } from "zod";
import { aiBook, aiCancel, aiServiceDetails, aiServices, aiSlots, type AiTarget, type Db } from "@ownlevel/core";

/**
 * Tools of the public booking endpoint (`/book/{agency}/{client}`): a visitor's AI assistant, no sign-in, the same
 * as the public booking page. Kept apart from the staff registry so a staff tool can never be offered here.
 * What exists is decided by the client (see resolveAiTarget); nothing here knows other people's bookings.
 */
export type BookingContext = { db: Db; target: AiTarget };

export type BookingTool = {
  name: string;
  description: string;
  input: z.ZodObject;
  /** MCP annotations, so assistants can ask the visitor before anything that writes. */
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: false };
  run: (ctx: BookingContext, args: never) => Promise<unknown>;
};

const define = <S extends z.ZodObject>(t: Omit<BookingTool, "input" | "run"> & { input: S; run: (ctx: BookingContext, args: z.infer<S>) => Promise<unknown> }) => t as unknown as BookingTool;

const service = z.string().describe("Service id from services_list");

export const bookingTools: BookingTool[] = [
  define({
    name: "services_list",
    description: "List what can be booked here (service ids, names, durations, timezone). Start here.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    input: z.object({}),
    run: ({ target }) => Promise.resolve(aiServices(target)),
  }),
  define({
    name: "service_details",
    description: "What a service needs to book it: whether email or phone is required, and any extra questions to ask the person.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    input: z.object({ service }),
    run: ({ db, target }, a) => aiServiceDetails(db, target, a.service),
  }),
  define({
    name: "slots_find",
    description: "Free start times for a service on local days (in the service's timezone). Use the starts_at value to book.",
    annotations: { readOnlyHint: true, openWorldHint: false },
    input: z.object({
      service,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").describe("First local day, YYYY-MM-DD"),
      days: z.number().int().min(1).max(7).optional().describe("Number of days from date (default 1)"),
    }),
    run: ({ db, target }, a) => aiSlots(db, target, a.service, a.date, a.days),
  }),
  define({
    name: "appointment_book",
    description:
      "Book a time. Before calling, show the person the service, local time and the details you will use, and get their OK. Never invent or guess name, email or phone. Needs email or phone as service_details says. Use a starts_at returned by slots_find.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({
      service,
      starts_at: z.string().describe("A starts_at from slots_find"),
      name: z.string().describe("The person's full name"),
      email: z.string().optional(),
      phone: z.string().optional().describe("With country code, or set phone_country"),
      phone_country: z.string().length(2).optional().describe("2-letter country for a phone typed without a country code"),
      answers: z.record(z.string(), z.unknown()).optional().describe("Answers to the service's questions, by question key from service_details"),
    }),
    run: ({ db, target }, a) => aiBook(db, target, a),
  }),
  define({
    name: "appointment_cancel",
    description: "Cancel a booking made here, using the manage_token returned when it was booked. Confirm with the person first.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    input: z.object({ manage_token: z.string() }),
    run: ({ db, target }, a) => aiCancel(db, target, a.manage_token),
  }),
];
