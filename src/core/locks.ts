import { normalizePattern } from "./patterns";
import { isBlockActive, scheduleCoverage } from "./schedule";
import type { Block, Lock } from "./types";

export type Verdict = { ok: true } | { ok: false; reason: string; challenge?: "randomText" };

const OK: Verdict = { ok: true };
const no = (reason: string): Verdict => ({ ok: false, reason });

export function isLocked(block: Block, now: number): boolean {
  if (!isBlockActive(block, now)) return false;
  switch (block.lock.type) {
    case "none":
      return false;
    case "timer":
      return now < block.lock.until;
    case "randomText":
    case "untilEnd":
      return true;
  }
}

export function canStop(block: Block, now: number): Verdict {
  if (!isLocked(block, now)) return OK;
  if (block.lock.type === "randomText") {
    return { ok: false, reason: `Type ${block.lock.length} random characters to unlock.`, challenge: "randomText" };
  }
  if (block.lock.type === "timer") return no(`Locked until ${new Date(block.lock.until).toLocaleString()}.`);
  return no("Locked until this block ends.");
}

export function canDelete(block: Block, now: number): Verdict {
  return isLocked(block, now) ? no("A locked block can't be deleted.") : OK;
}

// No 0/O, 1/l/I: random-text unlocks should be tedious, not ambiguous.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?";

export function makeRandomText(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const asSet = (patterns: readonly string[]) => new Set(patterns.map(normalizePattern).filter(Boolean));

function lockIsAtLeastAsStrong(before: Lock, after: Lock): boolean {
  if (after.type === "untilEnd" || before.type === "none") return true;
  if (before.type === "timer") return after.type === "timer" && after.until >= before.until;
  if (before.type === "randomText") return after.type === "randomText" && after.length >= before.length;
  return false;
}

/** While a block is locked, edits may only make it stricter. */
export function validateEdit(before: Block, after: Block, now: number): Verdict {
  if (!isLocked(before, now)) return OK;

  const afterSites = asSet(after.websites);
  if ([...asSet(before.websites)].some((s) => !afterSites.has(s))) {
    return no("Websites can't be removed from a locked block.");
  }

  const afterApps = new Set(after.apps ?? []);
  if ((before.apps ?? []).some((app) => !afterApps.has(app))) {
    return no("Apps can't be removed from a locked block.");
  }

  const beforeExceptions = asSet(before.exceptions);
  if ([...asSet(after.exceptions)].some((e) => !beforeExceptions.has(e))) {
    return no("Exceptions can't be added to a locked block.");
  }

  const was = scheduleCoverage(before.schedule);
  const is = scheduleCoverage(after.schedule);
  if (was.some((on, i) => on === 1 && is[i] === 0)) {
    return no("A locked block's schedule can only be extended.");
  }

  if (before.runningUntil !== null && before.runningUntil > now && (after.runningUntil ?? 0) < before.runningUntil) {
    return no("A locked block can't be shortened.");
  }

  if (!lockIsAtLeastAsStrong(before.lock, after.lock)) {
    return no("A lock can only be made stronger while it's active.");
  }

  return OK;
}
