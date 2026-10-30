import type { Tx } from "../../db/index.js";

export type DeleteTarget = { clientId: string; object: string; id: string };
export type DeleteHook = (tx: Tx, target: DeleteTarget) => Promise<void>;

const hooks: DeleteHook[] = [];

/**
 * Deleting a record erases everything about it immediately, in one transaction.
 * Modules that keep data about a record (calendars: attendee details on past bookings) register a hook
 * that clears it; hooks run before the row is deleted, in the same transaction.
 */
export const registerDeleteHook = (h: DeleteHook) => void hooks.push(h);

export async function runDeleteHooks(tx: Tx, target: DeleteTarget) {
  for (const h of hooks) await h(tx, target);
}
