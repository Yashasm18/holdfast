# Holdfast

**A free, open-source website blocker you can't cheat your way out of.**

Paid focus apps charge a subscription for something your browser can already do.
Holdfast blocks distracting sites on a schedule or on demand, and its locks
mean "I'll just turn it off for a minute" stops working.

- **Block lists**: domains (and all their subdomains), specific paths,
  `*` wildcards, or plain keywords. Add exceptions for the parts you need.
- **Schedules**: run a block every weekday from 9 to 5, or start one for the
  next 25 minutes.
- **Locks** that make a running block hard to stop:
  - *Random text*: to stop early, type 30 or 120 random characters by hand.
    Paste is disabled.
  - *Timer*: can't be stopped until the time runs out.
  - *Until it ends*: can't be stopped at all while it's active.
- **Locked means locked**: while a block is locked you can add sites or extend
  its schedule, but you can't remove sites, add exceptions, shorten it, weaken
  the lock, or delete it.
- **Private by design**: no account, no server, no tracking. Everything stays
  in your browser.

## Install (from source)

```bash
npm install
npm run build
```

Then in Chrome, Edge, Brave, Arc or another Chromium browser: open
`chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and
pick `dist/extension`. To make it apply in private windows too, open the
extension's details and turn on **Allow in Incognito**.

## How it works

Holdfast turns your active blocks into browser
[`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
rules, so the browser itself redirects blocked pages to a calm "Stay with it"
screen. Nothing inspects your traffic, and blocking keeps working even while the
extension's background worker is asleep. A one-minute alarm keeps scheduled
blocks in sync, and tabs that are already open on a blocked site are redirected
the moment a block starts.

All the rules (pattern matching, schedules, lock checks) live in a small,
browser-free TypeScript core (`src/core`) with unit tests, so a future desktop
agent can share exactly the same logic. See [docs/architecture.md](docs/architecture.md).

## Development

```bash
npm test          # unit tests for the core rules
npm run typecheck
npm run e2e       # loads the built extension into Chromium and checks real blocking
npm run watch     # rebuild on change
```

`npm run e2e` needs a Chromium that allows unpacked extensions: Playwright's
Chromium, or set `CHROME_PATH` to Chrome for Testing. Branded Google Chrome
ignores `--load-extension`.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md). The big next step is a **macOS
agent** that blocks apps, restarts itself if killed, and keeps the extension
from being removed during a locked block.

## Background

Holdfast's feature set was informed by a behavioral study of how a popular paid
blocker works. See [docs/research/cold-turkey-teardown.md](docs/research/cold-turkey-teardown.md).
No code, assets, or text from any other product are used here. Holdfast is an
independent project, not affiliated with Cold Turkey or any other vendor.

## License

[MIT](LICENSE)
