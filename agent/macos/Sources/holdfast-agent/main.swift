import Foundation
import HoldfastAgentCore

// One binary, several roles:
//   holdfast-agent run                      the LaunchAgent daemon
//   holdfast-agent chrome-extension://…/    started by the browser as the native messaging host
//   holdfast-agent status                   print blocks and whether any is locked
//   holdfast-agent is-locked                exit 0 if a block is locked right now, 1 if not

let arguments = Array(CommandLine.arguments.dropFirst())
let paths = AgentPaths.fromEnvironment()

func runNativeHost(origin: String) -> Never {
    let stdin = FileHandle.standardInput
    do {
        while let message = try NativeMessaging.read(using: { stdin.readData(ofLength: $0) }) {
            let reply = NativeHost.handle(message, origin: origin, paths: paths)
            FileHandle.standardOutput.write(try NativeMessaging.frame(reply))
        }
        exit(0)
    } catch {
        FileHandle.standardError.write(Data("holdfast-agent: native messaging failed: \(error)\n".utf8))
        exit(1)
    }
}

func printStatus() {
    let now = Date()
    let blocks = BlockStore.load(paths).compactMap(\.block)
    print("Holdfast agent \(agentVersion), data in \(paths.home.path)")
    if blocks.isEmpty { print("No blocks synced yet.") }
    for block in blocks {
        let state = isLocked(block, at: now) ? "locked" : isBlockActive(block, at: now) ? "active" : "off"
        let apps = block.apps.isEmpty ? "" : " — apps: \(block.apps.joined(separator: ", "))"
        print("  [\(state)] \(block.name)\(apps)")
    }
    let ids = BlockStore.loadExtensionIDs(paths)
    print("Extensions seen: \(ids.isEmpty ? "none" : ids.sorted().joined(separator: ", "))")
}

switch arguments.first {
case let origin? where origin.hasPrefix("chrome-extension://"):
    runNativeHost(origin: origin)
case "run":
    Daemon(paths: paths).run()
case "status":
    printStatus()
case "is-locked":
    let now = Date()
    exit(BlockStore.load(paths).compactMap(\.block).contains { isLocked($0, at: now) } ? 0 : 1)
case "version", "--version":
    print(agentVersion)
default:
    FileHandle.standardError.write(Data("usage: holdfast-agent run | status | is-locked | version\n".utf8))
    exit(64)
}
