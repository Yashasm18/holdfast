import { buildDnrRules } from "../core/dnr";
import { canDelete, canStop, isLocked, makeRandomText, validateEdit, type Verdict } from "../core/locks";
import { isUrlBlocked } from "../core/patterns";
import { isBlockActive } from "../core/schedule";
import type { Block } from "../core/types";
import type { Request, Response } from "./messages";

const BLOCK_PAGE = chrome.runtime.getURL("blocked.html");
const TICK = "holdfast-tick";

async function loadBlocks(): Promise<Block[]> {
  const { blocks } = await chrome.storage.local.get("blocks");
  return (blocks as Block[] | undefined) ?? [];
}

async function saveBlocks(blocks: Block[]): Promise<void> {
  await chrome.storage.local.set({ blocks });
  await enforce();
}

/** Recompute which blocks are active and push matching rules into the browser. */
async function enforce(): Promise<void> {
  const now = Date.now();
  const active = (await loadBlocks()).filter((b) => isBlockActive(b, now));

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: buildDnrRules(active, BLOCK_PAGE) as chrome.declarativeNetRequest.Rule[],
  });

  // Rules only apply to new navigations, so redirect tabs that are already open.
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined && tab.url && isUrlBlocked(tab.url, active)) {
      await chrome.tabs.update(tab.id, { url: `${BLOCK_PAGE}#${tab.url}` });
    }
  }
}

// Random-text challenges live in session storage: they vanish when the browser closes.
async function challengeFor(id: string, length: number): Promise<string> {
  const key = `challenge:${id}`;
  const stored = (await chrome.storage.session.get(key))[key] as string | undefined;
  if (stored?.length === length) return stored;
  const text = makeRandomText(length);
  await chrome.storage.session.set({ [key]: text });
  return text;
}

async function handle(request: Request): Promise<Response> {
  const now = Date.now();
  const blocks = await loadBlocks();
  const index = "id" in request ? blocks.findIndex((b) => b.id === request.id) : -1;
  const result = (verdict: Verdict, challengeText?: string): Response => ({ type: "result", verdict, challengeText });

  switch (request.type) {
    case "list":
      return {
        type: "list",
        blocks: blocks.map((block) => ({ block, active: isBlockActive(block, now), locked: isLocked(block, now) })),
      };

    case "save": {
      const i = blocks.findIndex((b) => b.id === request.block.id);
      if (i === -1) {
        blocks.push(request.block);
      } else {
        const verdict = validateEdit(blocks[i]!, request.block, now);
        if (!verdict.ok) return result(verdict);
        blocks[i] = request.block;
      }
      await saveBlocks(blocks);
      return result({ ok: true });
    }

    case "delete": {
      if (index === -1) return result({ ok: true });
      const verdict = canDelete(blocks[index]!, now);
      if (!verdict.ok) return result(verdict);
      blocks.splice(index, 1);
      await saveBlocks(blocks);
      return result(verdict);
    }

    case "start": {
      if (index === -1) return result({ ok: false, reason: "Block not found." });
      const before = blocks[index]!;
      const until = Math.max(before.runningUntil ?? 0, now + request.minutes * 60_000);
      const lock = request.lock.type === "timer" ? { type: "timer" as const, until } : request.lock;
      const after: Block = { ...before, runningUntil: until, lock };
      const verdict = validateEdit(before, after, now);
      if (!verdict.ok) return result(verdict);
      blocks[index] = after;
      await saveBlocks(blocks);
      return result(verdict);
    }

    case "stop": {
      if (index === -1) return result({ ok: true });
      const block = blocks[index]!;
      const verdict = canStop(block, now);
      if (!verdict.ok) {
        if (verdict.challenge !== "randomText" || block.lock.type !== "randomText") return result(verdict);
        const expected = await challengeFor(block.id, block.lock.length);
        if (request.answer !== expected) return result(verdict, expected);
        await chrome.storage.session.remove(`challenge:${block.id}`);
      }
      // Stopping ends a manual run and drops the lock; the weekly schedule stays.
      blocks[index] = { ...block, runningUntil: null, lock: { type: "none" } };
      await saveBlocks(blocks);
      return result({ ok: true });
    }
  }
}

chrome.runtime.onMessage.addListener((request: Request, _sender, reply) => {
  handle(request).then(reply);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK) void enforce();
});

const start = () => {
  void chrome.alarms.create(TICK, { periodInMinutes: 1 });
  void enforce();
};
chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
