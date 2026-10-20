# macOS agent

The extension can only block what happens inside one browser. The agent is a
small Swift program (`agent/macos`) that runs in the background and closes the
gaps listed in [architecture.md](architecture.md#known-limits-of-an-extension-only-blocker):

- **App blocking.** Each block can list Mac apps by bundle ID (options page,
  "Quit these Mac apps"). While the block is active, the agent quits those
  apps when they launch or come to the front, and sweeps every few seconds so
  a schedule that starts while an app is open still applies.
- **Keeps itself running.** It's a per-user LaunchAgent with `KeepAlive`, so
  launchd restarts it if it crashes or is killed.
- **Keeps the extension in place.** While any block is locked, Chromium
  browsers (Chrome, Edge, Brave, Chromium, Vivaldi, Arc) with an open profile
  that doesn't have Holdfast installed and enabled are quit.
- **Optional strict mode.** While a block is locked, also quit Activity Monitor
  and Terminal so the agent can't easily be killed by hand.
- **Uninstall waits for locks.** `uninstall.sh` refuses while any block is
  locked.

## Install

Needs macOS 13+ and Swift 6 (Xcode or the Command Line Tools:
`xcode-select --install`).

```bash
cd agent/macos
./install.sh            # or ./install.sh --strict
```

This builds a release binary and, all under your home folder:

| What | Where |
| --- | --- |
| Agent binary | `~/Library/Application Support/Holdfast/bin/holdfast-agent` |
| Blocks shared with the extension | `~/Library/Application Support/Holdfast/blocks.json` |
| Settings | `~/Library/Application Support/Holdfast/agent.json` |
| LaunchAgent | `~/Library/LaunchAgents/app.holdfast.agent.plist` |
| Native messaging hosts | `<browser data>/NativeMessagingHosts/app.holdfast.agent.json` for Chrome, Edge and Brave, plus Chrome Beta/Canary, Chromium, Vivaldi and Arc if installed |
| Log | `~/Library/Logs/Holdfast/agent.log` |

Then reload the extension (or restart the browser) so it syncs. Check with:

```bash
"$HOME/Library/Application Support/Holdfast/bin/holdfast-agent" status
```

Options: `--strict`, `--extension-id ID` (also accept another build of the
extension, e.g. a store version), `--skip-build`, `--no-load` (write files but
don't start the LaunchAgent).

To remove it (refused while a block is locked):

```bash
./uninstall.sh          # keeps blocks.json; --purge deletes it too
```

### Settings (`agent.json`)

```json
{
  "quitWhileLocked": ["com.apple.ActivityMonitor", "com.apple.Terminal"],
  "closeBrowsersWithoutExtension": true,
  "pollSeconds": 5
}
```

`quitWhileLocked` is empty unless you install with `--strict`; add any bundle
ID (iTerm is `com.googlecode.iterm2`). To block Safari or Firefox outright
while a block runs, add `com.apple.Safari` or `org.mozilla.firefox` to that
block's app list. `install.sh` creates this file or makes it stricter, but never
loosens it. Find an app's bundle ID with `osascript -e 'id of app "Steam"'`.

## How the extension and the agent stay in sync

The extension has the ID `heobnbeibkeonkmhacjdplleondionnd`, pinned by the
`key` in `static/manifest.json` so the native messaging manifest can name it in
`allowed_origins`. On startup, after every change and once a minute, the
background worker calls `chrome.runtime.sendNativeMessage("app.holdfast.agent",
{ type: "sync", blocks })`. The browser starts `holdfast-agent` with the
extension's origin as its argument, and the agent:

1. takes the extension's list as the new truth (the extension has already run
   `validateEdit` / `canStop` / `canDelete` on every change),
2. **except** that a block which is locked in the agent's copy can't vanish.
   The extension never deletes a locked block, so a missing one means storage
   was wiped or the extension was reinstalled. The agent keeps it and sends it
   back in `restored`, and the extension adopts it,
3. writes `blocks.json` atomically, remembers the extension ID, and replies.

The daemon re-reads `blocks.json` on every pass, so changes take effect within
`pollSeconds`. Blocks are stored as raw JSON, so fields from newer extensions
survive a round trip through an older agent.

Lock semantics are ported from `src/core` (`isScheduledAt`, `isBlockActive`,
`isLocked`) and both implementations run the same cases in
[`tests/fixtures/lock-semantics.json`](../tests/fixtures/lock-semantics.json).

### Detecting browsers without the extension

Chromium keeps its state in plain JSON. The agent reads `Local State`
(`profile.last_active_profiles` = the open profiles) and each open profile's
`Secure Preferences` / `Preferences` (`extensions.settings.<id>`). A profile
passes if a Holdfast extension ID the agent has seen is present and has no
`disable_reasons` (or old-style `state: 0`). The check only runs while a block
is locked and only after some extension has synced, so a fresh install never
starts quitting browsers. Chromium writes these files a few seconds after a
change, so a disabled extension is noticed within roughly 10–20 seconds.

## Forcing the extension on with browser policy (optional, manual)

The agent quits browsers that lack the extension, but it doesn't install the
extension for you, and it never writes browser or system policies. If you want
the browser itself to refuse to remove or disable Holdfast, you can set the
`ExtensionInstallForcelist` policy yourself:

- **Value:** `heobnbeibkeonkmhacjdplleondionnd;https://clients2.google.com/service/update2/crx`
  (extension ID; update URL). Policy-installed extensions can't be disabled or
  removed from `chrome://extensions`.
- **Where:** on macOS, Chrome, Edge and Brave only treat this policy as
  mandatory when it comes from a **configuration profile** (managed
  preferences). Plain `defaults write com.google.Chrome …` in your user domain
  isn't enough. Create a `.mobileconfig` with a `com.google.Chrome` payload
  (`com.microsoft.Edge` for Edge, `com.brave.Browser` for Brave) containing
  `ExtensionInstallForcelist`, then double-click it and approve it in
  **System Settings → General → Device Management**. Approving it is the
  explicit step that stays with you. Remove the profile there to undo it.
- **Caveat:** force-install downloads the extension from its update URL, so it
  needs Holdfast to be published in the Chrome Web Store (planned). Chrome on
  macOS only force-installs extensions hosted elsewhere on MDM-managed Macs,
  and an unpacked development build can't be force-installed at all. Until
  then, the agent's "quit browsers without the extension" check is the
  safeguard.

## Limits

The agent runs as you, not as root, which keeps it simple and lets it see
your apps. It raises the bar but doesn't make cheating impossible: someone
determined can `launchctl bootout` the agent, edit `blocks.json`, or change the
system clock to end a timer lock early. A root LaunchDaemon with protected
state, and blocking the Date & Time settings pane, are possible follow-ups.
Safari and Firefox aren't inspected for the extension; block them as apps if
you need to.

## Development

```bash
cd agent/macos
./test.sh          # swift test (adds the swift-testing path on Command-Line-Tools-only Macs)
swift build
cd ../.. && npm run e2e:agent   # real browser ⇄ agent sync over native messaging
```

`npm run e2e:agent` registers the debug build as a native messaging host
inside a throwaway browser profile with a temporary `HOLDFAST_HOME`, so it
installs nothing on your machine. Set `CHROME_PATH` as for `npm run e2e`.
