import Foundation

/// A Chromium-based browser the agent knows how to inspect.
public struct ChromiumBrowser: Equatable, Sendable {
    public var bundleID: String
    public var name: String
    /// User data directory, relative to ~/Library/Application Support.
    public var userDataPath: String

    public static let known: [ChromiumBrowser] = [
        .init(bundleID: "com.google.Chrome", name: "Google Chrome", userDataPath: "Google/Chrome"),
        .init(bundleID: "com.google.Chrome.beta", name: "Google Chrome Beta", userDataPath: "Google/Chrome Beta"),
        .init(bundleID: "com.google.Chrome.dev", name: "Google Chrome Dev", userDataPath: "Google/Chrome Dev"),
        .init(bundleID: "com.google.Chrome.canary", name: "Google Chrome Canary", userDataPath: "Google/Chrome Canary"),
        .init(bundleID: "org.chromium.Chromium", name: "Chromium", userDataPath: "Chromium"),
        .init(bundleID: "com.microsoft.edgemac", name: "Microsoft Edge", userDataPath: "Microsoft Edge"),
        .init(bundleID: "com.microsoft.edgemac.Beta", name: "Microsoft Edge Beta", userDataPath: "Microsoft Edge Beta"),
        .init(bundleID: "com.microsoft.edgemac.Dev", name: "Microsoft Edge Dev", userDataPath: "Microsoft Edge Dev"),
        .init(bundleID: "com.brave.Browser", name: "Brave", userDataPath: "BraveSoftware/Brave-Browser"),
        .init(bundleID: "com.vivaldi.Vivaldi", name: "Vivaldi", userDataPath: "Vivaldi"),
        .init(bundleID: "company.thebrowser.Browser", name: "Arc", userDataPath: "Arc/User Data"),
    ]

    public static func forBundleID(_ bundleID: String) -> ChromiumBrowser? {
        known.first { $0.bundleID.caseInsensitiveCompare(bundleID) == .orderedSame }
    }

    public func userDataDirectory(applicationSupport: URL) -> URL {
        applicationSupport.appendingPathComponent(userDataPath, isDirectory: true)
    }
}

/// Reads a Chromium user data directory to tell whether every open profile has
/// Holdfast installed and enabled. Chromium keeps this in plain JSON files:
/// `Local State` lists the profiles open in the last session and
/// `<profile>/Secure Preferences` / `Preferences` hold `extensions.settings`.
public enum ChromiumProfiles {
    /// Profile directory names that are open (or were at the last write).
    public static func openProfiles(localState: JSONValue?) -> [String] {
        let profile = localState?["profile"]
        let active = profile?["last_active_profiles"]?.arrayValue?.compactMap(\.stringValue) ?? []
        if !active.isEmpty { return active }
        if let lastUsed = profile?["last_used"]?.stringValue, !lastUsed.isEmpty { return [lastUsed] }
        return ["Default"]
    }

    /// Whether any of `ids` is installed and not disabled, according to these preference files.
    public static func hasExtension(preferences: [JSONValue], ids: Set<String>) -> Bool {
        ids.contains { id in
            let entries = preferences.compactMap { $0["extensions"]?["settings"]?[id] }
            return !entries.isEmpty && !entries.contains(where: isDisabled)
        }
    }

    static func isDisabled(_ entry: JSONValue) -> Bool {
        // Older Chromium: "state": 0 means disabled. Newer: a non-empty "disable_reasons"
        // (an int bitmask or a list, depending on the version).
        if case .number(let state)? = entry["state"], state == 0 { return true }
        switch entry["disable_reasons"] {
        case .number(let mask)?: return mask != 0
        case .array(let reasons)?: return !reasons.isEmpty
        default: return false
        }
    }

    /// Open profiles in `userDataDirectory` without an enabled Holdfast extension.
    public static func profilesMissingExtension(userDataDirectory: URL, ids: Set<String>) -> [String] {
        let read = { (url: URL) in (try? Data(contentsOf: url)).flatMap { try? JSONValue.parse($0) } }
        let localState = read(userDataDirectory.appendingPathComponent("Local State"))
        return openProfiles(localState: localState).filter { profile in
            let dir = userDataDirectory.appendingPathComponent(profile, isDirectory: true)
            let preferences = ["Secure Preferences", "Preferences"].compactMap { read(dir.appendingPathComponent($0)) }
            return !hasExtension(preferences: preferences, ids: ids)
        }
    }
}
