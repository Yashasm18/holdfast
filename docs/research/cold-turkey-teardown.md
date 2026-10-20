# How Cold Turkey Blocker works (macOS, v4.9)

A behavioral teardown written to inform an independent, open-source
reimplementation (Holdfast). This document describes **architecture and
behavior only**. No Cold Turkey code, assets, or text are copied into Holdfast.
License activation and payment checks were deliberately not analyzed.

## Method

- Source: `Cold_Turkey_Mac_Installer.pkg` from `getcoldturkey.com/files/`
  (SHA-256 `690f13b7…3fa2`, signed "Developer ID Installer: Felix Belzile
  (VH26F58M5A)", notarized).
- The package was **expanded, never installed** (`pkgutil --expand-full`).
- Tools: REA 6.7.0 (`inspect_signature`, Ghidra 12.1.4 provider), `codesign`,
  `plutil`, `strings`, `lipo`. The obfuscated web UI string table was parsed
  statically; no target code was executed.

Labels below: **[O]** observed directly in the artifact, **[I]** inferred from
observations, **[?]** unknown / not verified.

## 1. Components

| Component | What it is |
|---|---|
| `Cold Turkey Blocker.app` | Swift/AppKit app. UI is a local HTML/jQuery page in a `WKWebView` talking to Swift via `WKScriptMessageHandler` **[O]** |
| `-agent` mode of the same binary | Background enforcer, started by a LaunchAgent **[O]** |
| `NMHChrome` / `NMHFirefox` / `NMHEdge` | Native Messaging Host binaries for browser extensions **[O]** |
| `NMHSafari.appex` | Safari App Extension with a content script `ct.js` on all sites **[O]** |
| `/Library/Application Support/Cold Turkey/*.db` | SQLite databases: `data-app.db`, `data-browser.db`, `data-helper.db` **[O]** |

Code signature of the main binary **[O]**: hardened runtime; entitlements are
only the team ID and an app group `group.getcoldturkey.blocker-shared-data`.
There is **no Network Extension, no endpoint-security, and no sandbox**
entitlement. That means blocking is not done at the network layer.

## 2. Install and persistence

From the package's `preinstall`/`launch` scripts **[O]**:

1. Kills running copies, removes old LaunchAgents and the old app.
2. Writes `/Library/LaunchAgents/com.getcoldturkey.blocker.agent.plist` that
   runs the app binary with `-agent` and **`KeepAlive = true`**. launchd
   restarts the agent whenever it exits or is killed.
3. Creates `/Library/Application Support/Cold Turkey/` with the three databases
   and sets it `chmod -R 777` so the per-user agent and browser hosts can write.
4. Bootstraps the agent into the console user's GUI session.

Anti-reinstall: the binary references `/Cold Turkey/installer-locked` and a
`blockInstaller` setting **[O]**; **[I]** while a locked block runs, the agent
refuses or blocks the installer so the user can't reinstall to reset state.

## 3. Website blocking

Website blocking happens **inside browsers**, via extensions **[O]**:

- The main app knows three Chromium extension IDs and the Firefox ID
  `coldturkey@getcoldturkey.com`, and writes a Native Messaging manifest
  `com.coldturkey.coldturkey.json` (with `allowed_origins`) into the
  `NativeMessagingHosts` folder of Chrome (+Beta/Dev), Edge (+Beta/Dev), Brave,
  Vivaldi, Firefox, LibreWolf, Ecosia and Sidekick.
- The NMH binary reads `settings` from SQLite and answers the extension with a
  JSON document of this shape (keys **[O]**, structure **[I]**):
  `version`, `blockListInfo.blocks{}`, `paused`, `statsEnabled`,
  `statsEnabledIncognito`, `statsStrict`, `blockEmbedded`, `blockCharity`,
  `blockSplit`, `blockInactive`, `forceAllowFile`, `isPro`,
  `ignoreIncognito`.
- The extension enforces it in the page/tab. Safari gets the same data through
  the app group and a content script (`ct.js`) **[O]**.
- Browsing time is recorded back into SQLite (`stats`, `statsStrict` tables
  with `domain`, `date`, `seconds`) **[O]**.

**Making the extension hard to remove [O]/[I]**: the app reads each browser's
`Preferences` and `Managed Preferences` plists (Chrome, Edge, Brave, Firefox,
Sidekick), Firefox `distribution/policy.json`, Safari's `Extensions.plist`, and
references `ExtensionInstallForcelist` / `forceExtensionInstall`. **[I]** It
checks whether the extension is present and enabled, can request
policy-forced install, and if a browser without the extension is opened during
a block it is treated as an "unsupported browser" (`blockUnsupported`) and
closed.

Blocklist matching features (from UI strings) **[O]**: domains, wildcard URL
patterns (e.g. `*.*/*q=*proxy*`), URL keywords, window-title keywords,
exceptions (allowlist), a `file://*.*` exception to keep local files
working, and a built-in proxy-site list.

## 4. App blocking

**[O]** References to `NSWorkspace.frontmostApplication` and
`forceTerminate`, plus app usage stats tables (`statsApp`, `statsAppStrict`
with a `file` column). **[I]** The agent periodically checks running/frontmost
applications against blocked app paths and force-quits matches. Window-title
blocking ("Add Window Title to Block") applies to apps too.

## 5. Strictness ("can't cheat") settings

Each is an on/off setting that only applies while a block is active **[O]**:

| Setting | Effect |
|---|---|
| `blockTaskManager` | Blocks Activity Monitor (and Terminal, **[?]**) |
| `blockTimeChange` | Blocks the Date & Time settings pane (prevents clock tricks) |
| `blockLoginChange` | Blocks the Login Items settings pane |
| `blockScreenTime` | Blocks the Screen Time pane |
| `blockUserChange` | Blocks Users & Groups (prevents making a new account) |
| `blockInstaller` | Blocks reinstalling Cold Turkey |
| `blockUnsupported` | Closes browsers that don't have the extension |
| `blockTaskManagerChrome` | Blocks the browser's own task manager |
| `blockInactive`, `blockSplit`, `blockEmbedded`, `blockCharity` | Extra web-side strictness options |

Settings panes are detected by path patterns such as
`Library/ExtensionKit/Extensions/DateAndTime` and the legacy
`DateAndTime.prefPane` **[O]**.

## 6. Data model

**Block** — a named list of websites, exceptions, apps and window titles,
with an on/off state and an optional **schedule** (weekly calendar of time
ranges). **[O]**

**Lock** — what it takes to stop a running block **[O]**:
`none`, `password` (block password, stored normalized), `random text`
(type N random characters/words to unlock), `timer` ("locked until"),
`restart` ("until a restart"), and `schedule` window locks (can't edit during
or N minutes before a scheduled window).

**Break** — controlled relief during a block **[O]**:
`pomodoro` (work/break minutes), `allowance` (X minutes per day/week/
schedule), `sessions` (N sessions per period), `delay` (wait N minutes
before unblocking), `reward` (earn break time by working), `random text`.

**Frozen Turkey** — locks the whole computer (lock screen or shutdown) for a
period, optionally on a schedule (`SACLockScreenImmediate`) **[O]**.

**Settings password** with strict modes (needed for new blocks, editing
locked blocks, etc.) **[O]**.

**Statistics** — per-day seconds per domain and per app, blocked counts **[O]**.

## 7. Command line

The agent binary accepts **[O]**: `-start "Block Name"` with `-lock X`,
`-password X`, `-random-text X`, `-as-is`; `-stop`; `-toggle`;
`-start-delay-break`; `-start-random-text-unblock`; `-open-blocker`.

## 8. Weak points (design lessons for Holdfast)

- **[I]** Everything runs as the logged-in user plus a world-writable data dir.
  A determined admin user can still `launchctl bootout` the agent or edit the
  SQLite file. Cold Turkey compensates by blocking the tools you'd use
  (Terminal/Activity Monitor/Settings panes) rather than by privilege.
- Website blocking depends on extensions being present, so most effort goes
  into detecting and forcing them.

## Open questions [?]

- The exact app-blocking poll interval and match rules (needs Ghidra
  decompilation of the agent loop).
- Whether managed browser policies are written by Cold Turkey or only read.
- How the timer lock survives clock changes beyond blocking the Date & Time pane.
