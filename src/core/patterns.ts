// Pattern syntax:
//   youtube.com            the domain and every subdomain, any path
//   reddit.com/r/funny     only URLs under that path
//   *.*/*q=*proxy*         `*` matches anything (within the host, or anywhere in the path)
//   casino                 a bare word (no dot, slash or *) matches anywhere in the URL
//
// Regexes are emitted in the RE2 subset so they work in Chrome's
// declarativeNetRequest `regexFilter` as well as in JavaScript.

const escapeRegex = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

export function normalizePattern(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export function isKeyword(pattern: string): boolean {
  return !/[./*]/.test(pattern);
}

export function patternToRegex(raw: string): string {
  const pattern = normalizePattern(raw);
  if (isKeyword(pattern)) return `^https?://.*${escapeRegex(pattern)}`;

  const slash = pattern.indexOf("/");
  const host = slash === -1 ? pattern : pattern.slice(0, slash);
  const path = slash === -1 ? "" : pattern.slice(slash + 1);

  const hostRegex = escapeRegex(host).replace(/\*/g, "[^/]*");
  const subdomains = host.startsWith("*") ? "" : "([^/]*\\.)?";
  const pathRegex = path
    ? `/${escapeRegex(path).replace(/\*/g, ".*")}.*`
    : "([/?#].*)?$";

  return `^https?://${subdomains}${hostRegex}(:[0-9]+)?${pathRegex}`;
}

export function matchesAny(url: string, patterns: readonly string[]): boolean {
  const target = url.toLowerCase();
  return patterns.some((p) => normalizePattern(p) !== "" && new RegExp(patternToRegex(p)).test(target));
}

export function isUrlBlocked(
  url: string,
  activeBlocks: readonly { websites: readonly string[]; exceptions: readonly string[] }[],
): boolean {
  const exceptions = activeBlocks.flatMap((b) => b.exceptions);
  if (matchesAny(url, exceptions)) return false;
  return activeBlocks.some((b) => matchesAny(url, b.websites));
}
