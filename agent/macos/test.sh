#!/bin/bash
# Runs `swift test`. With Xcode that's all it takes; with only the Command Line
# Tools, SwiftPM runs swift-testing suites only when its framework path is passed
# on the command line, so pass it here.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CLT_FRAMEWORKS="/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
if [[ ! -d /Applications/Xcode.app && -d "$CLT_FRAMEWORKS/Testing.framework" ]]; then
  exec swift test --package-path "$HERE" -Xswiftc -F -Xswiftc "$CLT_FRAMEWORKS" "$@"
fi
exec swift test --package-path "$HERE" "$@"
