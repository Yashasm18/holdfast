import type { Lock } from "../core/types";

export const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector(selector) as T;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function describeLock(lock: Lock): string {
  switch (lock.type) {
    case "none":
      return "No lock";
    case "timer":
      return `Locked until ${new Date(lock.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    case "randomText":
      return `Unlock by typing ${lock.length} random characters`;
    case "untilEnd":
      return "Can't be stopped until it ends";
  }
}

/** Builds a <select> for choosing a lock; read the choice back with lockFromSelect. */
export function lockSelect(current: Lock, { allowTimer = true } = {}): HTMLSelectElement {
  const select = el("select");
  const options: [string, string][] = [
    ["none", "No lock"],
    ["randomText:30", "Type 30 random characters to stop"],
    ["randomText:120", "Type 120 random characters to stop"],
    ["timer", "Can't stop until the timer ends"],
    ["untilEnd", "Can't stop until the block ends"],
  ];
  for (const [value, text] of options) {
    if (value === "timer" && !allowTimer) continue;
    select.append(el("option", { value, textContent: text }));
  }
  select.value = current.type === "randomText" ? `randomText:${current.length >= 120 ? 120 : 30}` : current.type;
  return select;
}

export function lockFromSelect(select: HTMLSelectElement): Lock {
  const [type, length] = select.value.split(":");
  if (type === "randomText") return { type, length: Number(length) };
  if (type === "timer") return { type, until: 0 }; // the background fills in the end time
  return { type: type as "none" | "untilEnd" };
}
