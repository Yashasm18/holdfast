#!/bin/bash
# Runs `swift test`. With Xcode that's all it takes. With only the Command Line
# Tools, swift-testing is installed but off the search paths, and SwiftPM only
# runs its suites when the framework path is on the command line, so add it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [[ "$(xcode-select -p 2>/dev/null)" == *CommandLineTools* ]]; then
  export HOLDFAST_CLT_TESTING=1
  exec swift test --package-path "$HERE" -Xswiftc -F -Xswiftc /Library/Developer/CommandLineTools/Library/Developer/Frameworks "$@"
fi
exec swift test --package-path "$HERE" "$@"
