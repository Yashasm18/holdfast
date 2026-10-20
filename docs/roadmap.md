# Roadmap

## 0.1 — browser extension (this release)
- [x] Block lists with domains, paths, wildcards, keywords and exceptions
- [x] Weekly schedules and "block for N minutes"
- [x] Random-text, timer and until-end locks; locked blocks can only get stricter
- [x] Redirect already-open tabs when a block starts
- [x] Unit tests for the core, end-to-end test in real Chromium

## 0.2 — breaks and stats
- [ ] Pomodoro: alternate work and break periods inside a block
- [ ] Allowances: N minutes per day on a blocked site
- [ ] Local statistics: time on sites, blocked attempts
- [ ] Firefox build (MV3 `declarativeNetRequest` is supported there)
- [ ] Import/export blocks as JSON

## 0.3 — macOS agent ("can't cheat" mode)
- [ ] Small Swift agent installed as a `KeepAlive` LaunchAgent so it restarts if killed
- [ ] App blocking: watch launched/frontmost apps and quit blocked ones
- [ ] Keep the extension installed: managed-policy force-install for Chromium browsers,
      close browsers that don't have it while a lock is active
- [ ] Optional strictness: block Activity Monitor, Terminal, Date & Time settings
      and uninstalling Holdfast while a lock is active
- [ ] Native messaging so the extension and agent share one source of truth

## Later
- [ ] Windows and Linux agents
- [ ] Optional sync of block lists across devices (self-hostable)
- [ ] Shared community block lists
