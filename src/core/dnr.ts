import { normalizePattern, patternToRegex } from "./patterns";

// Structural subset of chrome.declarativeNetRequest.Rule, so core stays free of browser globals.
export interface DnrRule {
  id: number;
  priority?: number;
  action: {
    type: "block" | "redirect" | "allow";
    redirect?: { regexSubstitution: string };
  };
  condition: { regexFilter: string; resourceTypes?: ("main_frame" | "sub_frame")[] };
}

const BLOCK_PRIORITY = 1;
const EXCEPTION_PRIORITY = 2;

const unique = (patterns: readonly string[]) => [...new Set(patterns.map(normalizePattern).filter(Boolean))];

export function buildDnrRules(
  activeBlocks: readonly { websites: readonly string[]; exceptions: readonly string[] }[],
  blockPageUrl: string,
): DnrRule[] {
  const rules: DnrRule[] = [];
  const nextId = () => rules.length + 1;

  for (const pattern of unique(activeBlocks.flatMap((b) => b.exceptions))) {
    rules.push({
      id: nextId(),
      priority: EXCEPTION_PRIORITY,
      action: { type: "allow" },
      condition: { regexFilter: patternToRegex(pattern), resourceTypes: ["main_frame", "sub_frame"] },
    });
  }

  for (const pattern of unique(activeBlocks.flatMap((b) => b.websites))) {
    const regexFilter = patternToRegex(pattern);
    rules.push({
      id: nextId(),
      priority: BLOCK_PRIORITY,
      action: { type: "redirect", redirect: { regexSubstitution: `${blockPageUrl}#\\0` } },
      condition: { regexFilter, resourceTypes: ["main_frame"] },
    });
    rules.push({
      id: nextId(),
      priority: BLOCK_PRIORITY,
      action: { type: "block" },
      condition: { regexFilter, resourceTypes: ["sub_frame"] },
    });
  }

  return rules;
}
