import { describe, expect, it } from "vitest";
import { buildDnrRules } from "./dnr";

const PAGE = "chrome-extension://abc/blocked.html";

describe("buildDnrRules", () => {
  const rules = buildDnrRules(
    [
      { websites: ["youtube.com", "YouTube.com/", "x.com"], exceptions: ["youtube.com/feed"] },
      { websites: ["x.com"], exceptions: [] },
    ],
    PAGE,
  );

  it("dedupes patterns across blocks and gives unique ids", () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rules.filter((r) => r.action.type === "redirect")).toHaveLength(2);
  });

  it("redirects top-level pages to the block page with the original URL in the hash", () => {
    const redirect = rules.find((r) => r.action.type === "redirect")!;
    expect(redirect.action.redirect?.regexSubstitution).toBe(`${PAGE}#\\0`);
    expect(redirect.condition.resourceTypes).toEqual(["main_frame"]);
  });

  it("blocks embedded frames of blocked sites", () => {
    expect(rules.some((r) => r.action.type === "block" && r.condition.resourceTypes?.includes("sub_frame"))).toBe(true);
  });

  it("gives exceptions higher priority than blocks", () => {
    const allow = rules.find((r) => r.action.type === "allow")!;
    const redirect = rules.find((r) => r.action.type === "redirect")!;
    expect(allow.priority).toBeGreaterThan(redirect.priority!);
  });

  it("returns no rules when nothing is active", () => {
    expect(buildDnrRules([], PAGE)).toEqual([]);
  });
});
