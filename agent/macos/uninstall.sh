#!/bin/bash
# Removes the Holdfast agent, its LaunchAgent and native messaging hosts.
# Refuses while any block is locked: that's the point of a lock.
#
#   ./uninstall.sh           remove the agent, keep your synced blocks
#   ./uninstall.sh --purge   also delete ~/Library/Application Support/Holdfast
set -euo pipefail

LABEL="app.holdfast.agent"
PURGE=0
if [[ "${1:-}" == "--purge" ]]; then PURGE=1; fi

SUPPORT="$HOME/Library/Application Support"
HOLDFAST="$SUPPORT/Holdfast"
BIN="$HOLDFAST/bin/holdfast-agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Check with the installed agent, or this checkout's release build if it's already gone.
CHECKER="$BIN"
[[ -x "$CHECKER" ]] || CHECKER="$(cd "$(dirname "$0")" && pwd)/.build/release/holdfast-agent"
if [[ -f "$HOLDFAST/blocks.json" ]]; then
  if [[ ! -x "$CHECKER" ]]; then
    echo "Can't check for locked blocks: $BIN is missing. Run ./install.sh, then uninstall." >&2
    exit 1
  fi
  if HOLDFAST_HOME="$HOLDFAST" "$CHECKER" is-locked; then
    echo "A Holdfast block is locked right now, so the agent can't be uninstalled." >&2
    echo "Try again when the lock ends." >&2
    HOLDFAST_HOME="$HOLDFAST" "$CHECKER" status >&2 || true
    exit 1
  fi
fi

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
for dir in "Google/Chrome" "Google/Chrome Beta" "Google/Chrome Canary" "Chromium" "Microsoft Edge" \
           "BraveSoftware/Brave-Browser" "Vivaldi" "Arc/User Data"; do
  rm -f "$SUPPORT/$dir/NativeMessagingHosts/$LABEL.json"
done
rm -rf "$HOLDFAST/bin"
if [[ $PURGE -eq 1 ]]; then
  rm -rf "$HOLDFAST" "$HOME/Library/Logs/Holdfast"
  echo "Removed the Holdfast agent and its data."
else
  echo "Removed the Holdfast agent. Your synced blocks remain in $HOLDFAST (use --purge to delete)."
fi
