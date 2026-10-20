#!/bin/bash
# Installs the Holdfast agent for the current user: the binary, a KeepAlive
# LaunchAgent, and native messaging host manifests for Chromium browsers.
# Everything goes under your home folder; no sudo, no system policies.
#
#   ./install.sh                     build, install and start the agent
#   ./install.sh --strict            also quit Activity Monitor and Terminal while a block is locked
#   ./install.sh --extension-id ID   also accept this extension ID (e.g. a Web Store build)
#   ./install.sh --skip-build        install the existing release build
#   ./install.sh --no-load           install files but don't start the LaunchAgent
set -euo pipefail

LABEL="app.holdfast.agent"
EXTENSION_IDS=("heobnbeibkeonkmhacjdplleondionnd") # pinned by the key in static/manifest.json
STRICT=0 BUILD=1 LOAD=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict) STRICT=1 ;;
    --skip-build) BUILD=0 ;;
    --no-load) LOAD=0 ;;
    --extension-id) EXTENSION_IDS+=("${2:?--extension-id needs an ID}"); shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
  shift
done

HERE="$(cd "$(dirname "$0")" && pwd)"
SUPPORT="$HOME/Library/Application Support"
HOLDFAST="$SUPPORT/Holdfast"
BIN="$HOLDFAST/bin/holdfast-agent"
LOGS="$HOME/Library/Logs/Holdfast"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ $BUILD -eq 1 ]]; then
  echo "Building holdfast-agent…"
  swift build --package-path "$HERE" -c release --product holdfast-agent
fi
BUILT="$(swift build --package-path "$HERE" -c release --show-bin-path)/holdfast-agent"
[[ -x "$BUILT" ]] || { echo "No release build at $BUILT; run without --skip-build." >&2; exit 1; }

mkdir -p "$HOLDFAST/bin" "$LOGS" "$(dirname "$PLIST")"
# Copy to a temp name and rename, so a running agent never sees a half-written binary.
cp "$BUILT" "$BIN.new" && chmod 755 "$BIN.new" && mv -f "$BIN.new" "$BIN"
echo "Installed $BIN"

# agent.json is only created or made stricter here, never loosened.
if [[ $STRICT -eq 1 ]]; then
  printf '%s\n' '{' \
    '  "quitWhileLocked": ["com.apple.ActivityMonitor", "com.apple.Terminal"],' \
    '  "closeBrowsersWithoutExtension": true' '}' > "$HOLDFAST/agent.json"
  echo "Strict mode: Activity Monitor and Terminal will be quit while a block is locked."
elif [[ ! -f "$HOLDFAST/agent.json" ]]; then
  printf '%s\n' '{' '  "quitWhileLocked": [],' '  "closeBrowsersWithoutExtension": true' '}' > "$HOLDFAST/agent.json"
fi

# Native messaging hosts, so the extension can sync blocks with the agent.
origins=""
for id in "${EXTENSION_IDS[@]}"; do origins+="${origins:+, }\"chrome-extension://$id/\""; done
write_host() {
  local dir="$SUPPORT/$1/NativeMessagingHosts"
  mkdir -p "$dir"
  cat > "$dir/$LABEL.json" <<JSON
{
  "name": "$LABEL",
  "description": "Holdfast agent: shares blocks with the Holdfast extension",
  "path": "$BIN",
  "type": "stdio",
  "allowed_origins": [$origins]
}
JSON
  echo "Registered native messaging host for $2"
}
write_host "Google/Chrome" "Google Chrome"
write_host "Microsoft Edge" "Microsoft Edge"
write_host "BraveSoftware/Brave-Browser" "Brave"
# Other Chromium browsers only if they're installed (their data folder exists).
for entry in "Google/Chrome Beta:Chrome Beta" "Google/Chrome Canary:Chrome Canary" "Chromium:Chromium" \
             "Vivaldi:Vivaldi" "Arc/User Data:Arc"; do
  if [[ -d "$SUPPORT/${entry%%:*}" ]]; then write_host "${entry%%:*}" "${entry#*:}"; fi
done

sed -e "s|__BINARY__|$BIN|" -e "s|__LOGS__|$LOGS|" "$HERE/LaunchAgent/$LABEL.plist" > "$PLIST"
plutil -lint -s "$PLIST"
echo "Wrote $PLIST"

if [[ $LOAD -eq 1 ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "Started the agent. Logs: $LOGS/agent.log"
else
  echo "Not started (--no-load). Start it with: launchctl bootstrap gui/$(id -u) \"$PLIST\""
fi
