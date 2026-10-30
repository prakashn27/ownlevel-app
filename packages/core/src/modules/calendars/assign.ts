import type { SlotHost } from "./slots.js";

/**
 * Round robin: the host assigned longest ago goes first (never assigned = first);
 * ties go to the higher priority, then to the lower user id so the choice is stable.
 */
export function pickRoundRobin(free: SlotHost[]): SlotHost | undefined {
  return [...free].sort(
    (a, b) =>
      (a.lastAssignedAt ?? 0) - (b.lastAssignedAt ?? 0) ||
      (b.priority ?? 0) - (a.priority ?? 0) ||
      a.userId.localeCompare(b.userId),
  )[0];
}
