import { describe, expect, it } from "vitest";
import { isBlockActive, isScheduledAt } from "./schedule";
import { canDelete, canStop, isLocked, makeRandomText, validateEdit } from "./locks";
import type { Block } from "./types";

// Wednesday 2026-10-21 10:30 local time.
const WED_1030 = new Date(2026, 9, 21, 10, 30).getTime();
const HOUR = 3_600_000;

const block = (overrides: Partial<Block> = {}): Block => ({
  id: "b1",
  name: "Distractions",
  websites: ["youtube.com"],
  exceptions: [],
  schedule: [],
  runningUntil: null,
  lock: { type: "none" },
  ...overrides,
});

describe("schedule", () => {
  const workHours = [{ day: 3 as const, start: 9 * 60, end: 17 * 60 }];

  it("is active inside a weekly window", () => {
    expect(isScheduledAt(workHours, WED_1030)).toBe(true);
    expect(isScheduledAt(workHours, WED_1030 + 7 * HOUR)).toBe(false);
  });
  it("treats end as exclusive", () => {
    expect(isScheduledAt(workHours, new Date(2026, 9, 21, 17, 0).getTime())).toBe(false);
  });
  it("is active while manually running", () => {
    expect(isBlockActive(block({ runningUntil: WED_1030 + HOUR }), WED_1030)).toBe(true);
    expect(isBlockActive(block({ runningUntil: WED_1030 - 1 }), WED_1030)).toBe(false);
  });
});

describe("locks", () => {
  const running = { runningUntil: WED_1030 + 2 * HOUR };

  it("an unlocked or inactive block is never locked", () => {
    expect(isLocked(block(running), WED_1030)).toBe(false);
    expect(isLocked(block({ lock: { type: "timer", until: WED_1030 + HOUR } }), WED_1030)).toBe(false);
  });

  it("a timer lock holds until its time, then releases", () => {
    const b = block({ ...running, lock: { type: "timer", until: WED_1030 + HOUR } });
    expect(canStop(b, WED_1030)).toMatchObject({ ok: false });
    expect(canStop(b, WED_1030 + HOUR)).toEqual({ ok: true });
  });

  it("a random-text lock asks for a challenge", () => {
    const b = block({ ...running, lock: { type: "randomText", length: 40 } });
    expect(canStop(b, WED_1030)).toEqual({ ok: false, reason: expect.any(String), challenge: "randomText" });
  });

  it("an until-end lock holds for as long as the block is active", () => {
    const b = block({ schedule: [{ day: 3, start: 9 * 60, end: 17 * 60 }], lock: { type: "untilEnd" } });
    expect(canStop(b, WED_1030).ok).toBe(false);
    expect(canStop(b, WED_1030 + 7 * HOUR)).toEqual({ ok: true });
  });

  it("locked blocks cannot be deleted", () => {
    const b = block({ ...running, lock: { type: "timer", until: WED_1030 + HOUR } });
    expect(canDelete(b, WED_1030).ok).toBe(false);
    expect(canDelete(block(), WED_1030).ok).toBe(true);
  });

  it("makeRandomText returns the requested length from an unambiguous alphabet", () => {
    const text = makeRandomText(64);
    expect(text).toHaveLength(64);
    expect(text).not.toMatch(/[0O1lI]/);
  });
});

describe("validateEdit on a locked block", () => {
  const locked = block({
    websites: ["youtube.com", "reddit.com"],
    exceptions: ["youtube.com/feed/subscriptions"],
    schedule: [{ day: 3, start: 9 * 60, end: 17 * 60 }],
    lock: { type: "timer", until: WED_1030 + HOUR },
  });

  it("allows making it stricter", () => {
    const after = { ...locked, websites: [...locked.websites, "x.com"], exceptions: [] };
    expect(validateEdit(locked, after, WED_1030)).toEqual({ ok: true });
  });
  it("rejects removing a website", () => {
    expect(validateEdit(locked, { ...locked, websites: ["youtube.com"] }, WED_1030).ok).toBe(false);
  });
  it("rejects adding an exception", () => {
    expect(validateEdit(locked, { ...locked, exceptions: [...locked.exceptions, "reddit.com"] }, WED_1030).ok).toBe(false);
  });
  it("rejects shrinking the schedule but allows extending it", () => {
    const shorter = { ...locked, schedule: [{ day: 3 as const, start: 9 * 60, end: 12 * 60 }] };
    const longer = { ...locked, schedule: [{ day: 3 as const, start: 8 * 60, end: 18 * 60 }] };
    expect(validateEdit(locked, shorter, WED_1030).ok).toBe(false);
    expect(validateEdit(locked, longer, WED_1030)).toEqual({ ok: true });
  });
  it("rejects weakening the lock", () => {
    const earlier = { ...locked, lock: { type: "timer" as const, until: WED_1030 + 1 } };
    expect(validateEdit(locked, earlier, WED_1030).ok).toBe(false);
    expect(validateEdit(locked, { ...locked, lock: { type: "none" as const } }, WED_1030).ok).toBe(false);
    expect(validateEdit(locked, { ...locked, lock: { type: "untilEnd" as const } }, WED_1030)).toEqual({ ok: true });
  });
  it("rejects shortening a manual run", () => {
    const manual = block({ runningUntil: WED_1030 + 2 * HOUR, lock: { type: "timer", until: WED_1030 + HOUR } });
    expect(validateEdit(manual, { ...manual, runningUntil: WED_1030 + HOUR }, WED_1030).ok).toBe(false);
  });
  it("allows anything once unlocked", () => {
    expect(validateEdit(locked, { ...locked, websites: [] }, WED_1030 + HOUR)).toEqual({ ok: true });
  });
});
