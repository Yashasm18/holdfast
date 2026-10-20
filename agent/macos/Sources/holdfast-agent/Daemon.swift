import AppKit
import HoldfastAgentCore

/// The long-running enforcer started by the LaunchAgent. Quits blocked apps the
/// moment they launch or come to the front, and sweeps everything on a timer so
/// schedules that start while an app is already open still take effect.
final class Daemon {
    private let paths: AgentPaths
    private var config: AgentConfig
    private var blocks: [Block] = []
    private var timer: Timer?
    /// PIDs we've asked to quit, so a slow-quitting app isn't asked every sweep.
    private var quitting: Set<pid_t> = []

    init(paths: AgentPaths) {
        self.paths = paths
        self.config = AgentConfig.load(paths)
    }

    func run() -> Never {
        log("holdfast-agent \(agentVersion) watching \(paths.home.path)")
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didActivateApplicationNotification] {
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
                self?.enforce(on: [app])
            }
        }
        sweep()
        scheduleTimer()
        RunLoop.main.run()
        exit(0)
    }

    private func scheduleTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: config.pollSeconds, repeats: true) { [weak self] _ in
            self?.sweep()
        }
    }

    private func sweep() {
        let previousPoll = config.pollSeconds
        config = AgentConfig.load(paths)
        if config.pollSeconds != previousPoll { scheduleTimer() }
        enforce(on: NSWorkspace.shared.runningApplications)
    }

    private func enforce(on apps: [NSRunningApplication]) {
        // Re-read on every pass: the native host writes blocks.json from another process.
        blocks = BlockStore.load(paths).compactMap(\.block)
        let byPID = Dictionary(apps.map { ($0.processIdentifier, $0) }, uniquingKeysWith: { first, _ in first })
        let running = apps.compactMap { app in
            app.bundleIdentifier.map { RunningApp(bundleID: $0, pid: app.processIdentifier) }
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let decisions = appsToQuit(
            blocks: blocks, config: config, running: running, now: Date(),
            knownExtensionIDs: BlockStore.loadExtensionIDs(paths)
        ) { browser in
            let missing = ChromiumProfiles.profilesMissingExtension(
                userDataDirectory: browser.userDataDirectory(applicationSupport: support),
                ids: BlockStore.loadExtensionIDs(paths))
            return !missing.isEmpty
        }
        for decision in decisions where decision.app.pid != getpid() {
            guard let app = byPID[decision.app.pid], !app.isTerminated, quitting.insert(app.processIdentifier).inserted else {
                continue
            }
            log("quitting \(decision.app.bundleID) (pid \(decision.app.pid)): \(decision.reason)")
            app.terminate()
            // Apps can refuse a polite quit (unsaved-changes sheets); force it after a grace period.
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                if !app.isTerminated { app.forceTerminate() }
                self?.quitting.remove(app.processIdentifier)
            }
        }
    }
}

func log(_ message: String) {
    let stamp = ISO8601DateFormatter().string(from: Date())
    FileHandle.standardError.write(Data("\(stamp) \(message)\n".utf8))
}
