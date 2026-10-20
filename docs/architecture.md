# Architecture

```
src/core/           pure TypeScript, no browser APIs, fully unit-tested
  types.ts          Block, ScheduleWindow, Lock
  patterns.ts       pattern syntax → RE2-compatible regex; URL matching
  schedule.ts       is a block active right now?
  locks.ts          is it locked? can it be stopped/deleted? is an edit allowed?
  dnr.ts            active blocks → declarativeNetRequest rules

src/extension/      Chrome MV3 extension
  background.ts     the only writer of state; enforces lock rules; syncs rules
  messages.ts       request/response types between UI pages and background
  popup.ts          start/stop blocks
  options.ts        create and edit blocks
  blocked.ts        the page users land on instead of a blocked site
```

## Decisions

**Browser-native blocking.** Instead of a content script or a native helper
deciding each page load, Holdfast compiles blocks into `declarativeNetRequest`
dynamic rules. The browser applies them before any request leaves, they
survive the service worker going idle, and the extension never sees page
content. Exceptions are `allow` rules at a higher priority than block rules.
Top-level pages are redirected to `blocked.html#<original url>` and embedded
frames are blocked outright.

**One writer.** UI pages never write `chrome.storage` directly; they send
requests to the background worker, which runs `validateEdit`, `canStop` and
`canDelete` from the core before saving. This keeps every lock rule in one
place.

**Locks only ratchet.** While a block is locked, an edit is accepted only if it
is at least as strict: website set is a superset, exception set is a subset,
schedule coverage is a superset (compared minute-by-minute over the week),
a manual run can't end sooner, and the lock can't get weaker.

**Random-text challenges** are generated with `crypto.getRandomValues` from an
alphabet without look-alike characters, kept in `chrome.storage.session` (gone
when the browser closes), and shown unselectable with paste disabled.

## Known limits of an extension-only blocker

Someone can still remove or disable the extension, use another browser, or
edit extension storage from DevTools. These are the gaps the planned macOS
agent closes (see [roadmap](roadmap.md)): a `KeepAlive` launch agent that
re-applies browser policies forcing the extension on, closes browsers without
it, and blocks apps.
