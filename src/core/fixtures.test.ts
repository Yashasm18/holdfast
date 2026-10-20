import { describe, expect, it } from "vitest";
import fixtures from "../../tests/fixtures/lock-semantics.json";
import { isLocked } from "./locks";
import { isBlockActive } from "./schedule";
import type { Block, Lock, ScheduleWindow } from "./types";

// The same cases run against the Swift port in agent/macos, so the extension
// and the macOS agent agree on when a block is active and locked.
describe("shared lock-semantics fixtures", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const now = new Date(c.now).getTime(); // no zone suffix: local time
      const at = (minutes: number) => now + minutes * 60_000;
      const { untilMinutes, ...lock } = c.block.lock as { type: Lock["type"]; untilMinutes?: number; length?: number };
      const block: Block = {
        id: "fixture",
        name: c.name,
        websites: [],
        exceptions: [],
        schedule: c.block.schedule as ScheduleWindow[],
        runningUntil: c.block.runningUntilMinutes === null ? null : at(c.block.runningUntilMinutes),
        lock: (untilMinutes === undefined ? lock : { ...lock, until: at(untilMinutes) }) as Lock,
      };
      expect({ active: isBlockActive(block, now), locked: isLocked(block, now) }).toEqual(c.expect);
    });
  }
});
