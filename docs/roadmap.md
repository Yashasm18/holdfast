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

## 0.3 — macOS agent ("can't cheat" mode) — see [macos-agent.md](macos-agent.md)
- [x] Small Swift agent installed as a `KeepAlive` LaunchAgent so it restarts if killed
- [x] App blocking: watch launched/frontmost apps and quit blocked ones
- [x] Keep the extension installed: close Chromium browsers whose open profile lacks it
      while a lock is active; managed-policy force-install documented (manual step)
- [x] Optional strictness: quit Activity Monitor and Terminal while a lock is active;
      `uninstall.sh` refuses while a lock is active
- [x] Native messaging so the extension and agent share one source of truth
- [ ] Block the Date & Time settings pane / detect clock changes during a timer lock
- [ ] Root LaunchDaemon with state the user can't edit
- [ ] Signed, notarized installer package

## Later
- [ ] Windows and Linux agents
- [ ] Optional sync of block lists across devices (self-hostable)
- [ ] Shared community block lists
