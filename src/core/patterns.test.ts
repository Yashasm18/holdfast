import { describe, expect, it } from "vitest";
import { isUrlBlocked, normalizePattern, patternToRegex } from "./patterns";

const matches = (pattern: string, url: string) => new RegExp(patternToRegex(pattern)).test(url);

describe("normalizePattern", () => {
  it("strips scheme, www and trailing slash and lowercases", () => {
    expect(normalizePattern("  HTTPS://www.YouTube.com/ ")).toBe("youtube.com");
  });
  it("returns empty string for blank input", () => {
    expect(normalizePattern("   ")).toBe("");
  });
});

describe("patternToRegex", () => {
  it("blocks a domain and all its subdomains on any path", () => {
    expect(matches("youtube.com", "https://youtube.com/")).toBe(true);
    expect(matches("youtube.com", "https://www.youtube.com/watch?v=1")).toBe(true);
    expect(matches("youtube.com", "http://m.youtube.com/feed")).toBe(true);
  });
  it("does not block lookalike domains", () => {
    expect(matches("youtube.com", "https://notyoutube.com/")).toBe(false);
    expect(matches("youtube.com", "https://youtube.com.evil.io/")).toBe(false);
  });
  it("blocks only under a path when one is given", () => {
    expect(matches("reddit.com/r/funny", "https://www.reddit.com/r/funny/top")).toBe(true);
    expect(matches("reddit.com/r/funny", "https://www.reddit.com/r/science")).toBe(false);
  });
  it("supports * wildcards", () => {
    expect(matches("*.*/*q=*proxy*", "https://search.example/find?q=free+proxy")).toBe(true);
    expect(matches("news.*", "https://news.ycombinator.com/")).toBe(true);
  });
  it("treats a bare word as a keyword anywhere in the URL", () => {
    expect(matches("casino", "https://example.com/best-casino-games")).toBe(true);
    expect(matches("casino", "https://example.com/")).toBe(false);
  });
  it("escapes regex metacharacters", () => {
    expect(matches("a+b.com", "https://a+b.com/")).toBe(true);
    expect(matches("a+b.com", "https://aab.com/")).toBe(false);
  });
});

describe("isUrlBlocked", () => {
  it("lets exceptions override website patterns", () => {
    const block = { websites: ["youtube.com"], exceptions: ["youtube.com/feed/subscriptions"] };
    expect(isUrlBlocked("https://www.youtube.com/watch?v=1", [block])).toBe(true);
    expect(isUrlBlocked("https://www.youtube.com/feed/subscriptions", [block])).toBe(false);
  });
  it("never blocks the browser's own pages", () => {
    expect(isUrlBlocked("chrome://extensions", [{ websites: ["*"], exceptions: [] }])).toBe(false);
  });
});
