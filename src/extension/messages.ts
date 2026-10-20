import type { Block } from "../core/types";
import type { Verdict } from "../core/locks";

// Every state change goes through the background worker, which enforces lock rules.
export type Request =
  | { type: "list" }
  | { type: "save"; block: Block }
  | { type: "delete"; id: string }
  | { type: "start"; id: string; minutes: number; lock: Block["lock"] }
  | { type: "stop"; id: string; answer?: string };

export interface BlockStatus {
  block: Block;
  active: boolean;
  locked: boolean;
}

export type Response =
  | { type: "list"; blocks: BlockStatus[] }
  | { type: "result"; verdict: Verdict; challengeText?: string };

export function send(request: Request): Promise<Response> {
  return chrome.runtime.sendMessage(request);
}
