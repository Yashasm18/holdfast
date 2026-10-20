import Foundation

/// Settings in agent.json. Every field is optional in the file.
public struct AgentConfig: Codable, Equatable, Sendable {
    /// Bundle IDs quit while any block is locked, e.g. Activity Monitor and Terminal
    /// so the agent can't be killed by hand. Empty by default; `install.sh --strict` fills it.
    public var quitWhileLocked: [String]
    /// While any block is locked, quit Chromium browsers with an open profile
    /// that doesn't have Holdfast installed and enabled.
    public var closeBrowsersWithoutExtension: Bool
    /// How often to re-read blocks and sweep running apps, in seconds.
    public var pollSeconds: Double

    public static let strictApps = ["com.apple.ActivityMonitor", "com.apple.Terminal"]

    public init(quitWhileLocked: [String] = [], closeBrowsersWithoutExtension: Bool = true, pollSeconds: Double = 5) {
        self.quitWhileLocked = quitWhileLocked
        self.closeBrowsersWithoutExtension = closeBrowsersWithoutExtension
        self.pollSeconds = pollSeconds
    }

    public init(from decoder: Decoder) throws {
        let defaults = AgentConfig()
        let container = try decoder.container(keyedBy: CodingKeys.self)
        quitWhileLocked = try container.decodeIfPresent([String].self, forKey: .quitWhileLocked) ?? defaults.quitWhileLocked
        closeBrowsersWithoutExtension = try container.decodeIfPresent(Bool.self, forKey: .closeBrowsersWithoutExtension)
            ?? defaults.closeBrowsersWithoutExtension
        pollSeconds = max(1, try container.decodeIfPresent(Double.self, forKey: .pollSeconds) ?? defaults.pollSeconds)
    }

    public static func load(_ paths: AgentPaths) -> AgentConfig {
        guard let data = try? Data(contentsOf: paths.config) else { return AgentConfig() }
        return (try? JSONDecoder().decode(AgentConfig.self, from: data)) ?? AgentConfig()
    }
}

public struct RunningApp: Equatable, Sendable {
    public var bundleID: String
    public var pid: Int32

    public init(bundleID: String, pid: Int32) {
        self.bundleID = bundleID
        self.pid = pid
    }
}

public struct QuitDecision: Equatable, Sendable {
    public var app: RunningApp
    public var reason: String
}

/// Apps the agent must never quit, whatever a block says: quitting these would
/// log the user out or wedge the desktop rather than block a distraction.
public let protectedBundleIDs: Set<String> = [
    "com.apple.finder", "com.apple.dock", "com.apple.loginwindow", "com.apple.systemuiserver",
    "com.apple.WindowManager", "com.apple.controlcenter", "com.apple.Spotlight",
].reduce(into: []) { $0.insert($1.lowercased()) }

/// Decides which running apps to quit. Pure: AppKit lives in the executable.
///
/// - `browserLacksExtension` is asked only for known Chromium browsers, only while
///   a block is locked, and only when at least one Holdfast extension ID is known.
public func appsToQuit(blocks: [Block], config: AgentConfig, running: [RunningApp], now: Date,
                       knownExtensionIDs: Set<String>, calendar: Calendar = .current,
                       browserLacksExtension: (ChromiumBrowser) -> Bool) -> [QuitDecision] {
    let active = blocks.filter { isBlockActive($0, at: now, calendar: calendar) }
    let locked = active.contains { isLocked($0, at: now, calendar: calendar) }

    var reasons: [String: String] = [:] // lowercased bundle ID → reason
    for block in active {
        for app in block.apps where reasons[app.lowercased()] == nil {
            reasons[app.lowercased()] = "blocked by \"\(block.name)\""
        }
    }
    if locked {
        for app in config.quitWhileLocked where reasons[app.lowercased()] == nil {
            reasons[app.lowercased()] = "not allowed while a block is locked"
        }
    }

    var lacksCache: [String: Bool] = [:]
    let checkBrowsers = locked && config.closeBrowsersWithoutExtension && !knownExtensionIDs.isEmpty

    return running.compactMap { app in
        let key = app.bundleID.lowercased()
        guard !protectedBundleIDs.contains(key) else { return nil }
        if let reason = reasons[key] { return QuitDecision(app: app, reason: reason) }
        if checkBrowsers, let browser = ChromiumBrowser.forBundleID(app.bundleID) {
            let lacks = lacksCache[key] ?? browserLacksExtension(browser)
            lacksCache[key] = lacks
            if lacks { return QuitDecision(app: app, reason: "Holdfast extension missing while a block is locked") }
        }
        return nil
    }
}
