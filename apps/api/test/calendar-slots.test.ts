import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSlots, pickRoundRobin, zonedToUtc, type SlotInput } from "@ownlevel/core";

const NOW = Date.parse("2030-01-01T00:00:00Z");
const MIN = 60_000;
const weekdays = Object.fromEntries(["mon", "tue", "wed", "thu", "fri"].map((d) => [d, [["09:00", "17:00"] as [string, string]]]));
const day = (date: string) => ({ from: Date.parse(`${date}T00:00:00Z`), to: Date.parse(`${date}T00:00:00Z`) + 24 * 60 * MIN });

const base = (o: Partial<SlotInput> = {}): SlotInput => ({
  type: "personal",
  weeklyHours: weekdays,
  timezone: "UTC",
  durationMin: 30,
  slotIntervalMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  maxDaysAhead: 365,
  hosts: [{ userId: "h1" }],
  hostBusy: {},
  now: NOW,
  ...day("2030-03-04"), // a Monday
  ...o,
});
const starts = (s: { start: string }[]) => s.map((x) => x.start.slice(11, 16));

describe("slot engine", () => {
  it("cuts weekly hours into slots and skips closed days", () => {
    const s = computeSlots(base());
    assert.equal(s.length, 16);
    assert.equal(starts(s)[0], "09:00");
    assert.equal(starts(s)[15], "16:30");
    assert.equal(computeSlots(base(day("2030-03-03"))).length, 0); // Sunday
  });

  it("uses the calendar's timezone and follows clock changes", () => {
    // New York springs forward on 2030-03-10: 09:00 local is 14:00Z the day before, 13:00Z that day.
    const ny = { timezone: "America/New_York", slotIntervalMin: 60, durationMin: 60, weeklyHours: { sat: [["09:00", "10:00"]], sun: [["09:00", "10:00"]] } as SlotInput["weeklyHours"] };
    assert.equal(starts(computeSlots(base({ ...ny, ...day("2030-03-09") })))[0], "14:00");
    assert.equal(starts(computeSlots(base({ ...ny, ...day("2030-03-10") })))[0], "13:00");
    assert.equal(zonedToUtc(2030, 3, 10, 9, 0, "America/New_York"), Date.parse("2030-03-10T13:00:00Z"));
  });

  it("drops slots whose buffered range meets a busy range", () => {
    const busy = { h1: [{ start: Date.parse("2030-03-04T10:00:00Z"), end: Date.parse("2030-03-04T10:30:00Z") }] };
    const s = starts(computeSlots(base({ bufferBeforeMin: 15, bufferAfterMin: 15, hostBusy: busy })));
    assert.ok(s.includes("09:00") && s.includes("11:00"));
    assert.ok(!s.includes("09:30") && !s.includes("10:00") && !s.includes("10:30"));
  });

  it("applies minimum notice and the booking horizon", () => {
    const now = Date.parse("2030-03-04T12:00:00Z");
    assert.equal(starts(computeSlots(base({ now, minNoticeMin: 60 })))[0], "13:00");
    assert.equal(computeSlots(base({ now: Date.parse("2030-02-01T00:00:00Z"), maxDaysAhead: 7 })).length, 0);
  });

  it("date overrides replace the weekly hours", () => {
    assert.equal(computeSlots(base({ overrides: { "2030-03-04": [] } })).length, 0);
    const s = computeSlots(base({ overrides: { "2030-03-04": [["10:00", "11:00"]] } }));
    assert.deepEqual(starts(s), ["10:00", "10:30"]);
  });

  it("round robin offers a slot while any host is free", () => {
    const busy = (id: string) => ({ [id]: [{ start: Date.parse("2030-03-04T09:00:00Z"), end: Date.parse("2030-03-04T09:30:00Z") }] });
    const hosts = [{ userId: "a" }, { userId: "b" }];
    const one = computeSlots(base({ type: "round_robin", hosts, hostBusy: busy("a") }));
    assert.deepEqual(one[0]!.hostIds, ["b"]);
    const both = computeSlots(base({ type: "round_robin", hosts, hostBusy: { ...busy("a"), ...busy("b") } }));
    assert.equal(starts(both)[0], "09:30");
  });

  it("collective needs every host free", () => {
    const hosts = [{ userId: "a" }, { userId: "b" }];
    const busy = { b: [{ start: Date.parse("2030-03-04T09:00:00Z"), end: Date.parse("2030-03-04T09:30:00Z") }] };
    const s = computeSlots(base({ type: "collective", hosts, hostBusy: busy }));
    assert.equal(starts(s)[0], "09:30");
    assert.deepEqual(s[0]!.hostIds, ["a", "b"]);
  });

  it("class shows seats left and hides full sessions", () => {
    const at = (t: string) => Date.parse(`2030-03-04T${t}:00Z`);
    const busy = { h1: [{ start: at("09:00"), end: at("09:30") }, { start: at("10:00"), end: at("10:30") }] };
    const s = computeSlots(base({ type: "class", capacity: 3, hostBusy: busy, sessions: [{ start: at("09:00"), seatsTaken: 2 }, { start: at("10:00"), seatsTaken: 3 }] }));
    const by = Object.fromEntries(s.map((x) => [x.start.slice(11, 16), x.seatsLeft]));
    assert.equal(by["09:00"], 1); // session with a seat left
    assert.ok(!("10:00" in by)); // full
    assert.equal(by["09:30"], 3); // free: a new session can start
  });

  it("round robin picks the longest-unassigned host, then priority", () => {
    assert.equal(pickRoundRobin([{ userId: "a", lastAssignedAt: 200 }, { userId: "b", lastAssignedAt: 100 }])!.userId, "b");
    assert.equal(pickRoundRobin([{ userId: "a", lastAssignedAt: 200 }, { userId: "b", lastAssignedAt: null }])!.userId, "b");
    assert.equal(pickRoundRobin([{ userId: "a", priority: 1 }, { userId: "b", priority: 5 }])!.userId, "b");
    assert.equal(pickRoundRobin([]), undefined);
  });
});
