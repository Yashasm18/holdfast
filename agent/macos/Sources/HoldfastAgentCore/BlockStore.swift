import Foundation

/// Where the agent keeps its state. `HOLDFAST_HOME` overrides it (tests, e2e).
public struct AgentPaths: Sendable {
    public var home: URL

    public init(home: URL) { self.home = home }

    public static func fromEnvironment(_ environment: [String: String] = ProcessInfo.processInfo.environment) -> AgentPaths {
        if let override = environment["HOLDFAST_HOME"], !override.isEmpty {
            return AgentPaths(home: URL(fileURLWithPath: override, isDirectory: true))
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return AgentPaths(home: support.appendingPathComponent("Holdfast", isDirectory: true))
    }

    /// Blocks shared with the extension: `{ "version": 1, "blocks": [...] }`.
    public var blocks: URL { home.appendingPathComponent("blocks.json") }
    /// Agent settings, see AgentConfig.
    public var config: URL { home.appendingPathComponent("agent.json") }
    /// Extension IDs that have synced with this agent.
    public var extensions: URL { home.appendingPathComponent("extensions.json") }
}

/// One stored block: the raw JSON from the extension plus the fields the agent understands.
public struct StoredBlock: Equatable, Sendable {
    public var raw: JSONValue
    /// Nil when the raw JSON isn't a block this agent can read; it is still kept.
    public var block: Block?

    public init(raw: JSONValue) {
        self.raw = raw
        self.block = try? raw.decode(Block.self)
    }

    public var id: String? { block?.id ?? raw["id"]?.stringValue }
}

public enum BlockStore {
    public static func load(_ paths: AgentPaths) -> [StoredBlock] {
        guard let data = try? Data(contentsOf: paths.blocks),
              let file = try? JSONValue.parse(data),
              let blocks = file["blocks"]?.arrayValue else { return [] }
        return blocks.map(StoredBlock.init(raw:))
    }

    public static func save(_ blocks: [StoredBlock], to paths: AgentPaths) throws {
        let file = JSONValue.object(["version": .number(1), "blocks": .array(blocks.map(\.raw))])
        try writeAtomically(try file.data(), to: paths.blocks)
    }

    public static func loadExtensionIDs(_ paths: AgentPaths) -> Set<String> {
        guard let data = try? Data(contentsOf: paths.extensions),
              let ids = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return Set(ids)
    }

    public static func rememberExtensionID(_ id: String, in paths: AgentPaths) throws {
        var ids = loadExtensionIDs(paths)
        guard ids.insert(id).inserted else { return }
        try writeAtomically(try JSONEncoder().encode(ids.sorted()), to: paths.extensions)
    }

    /// The native host and the daemon are separate processes; a rename means
    /// the daemon never reads a half-written file.
    static func writeAtomically(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
}

public struct SyncResult: Equatable, Sendable {
    public var blocks: [StoredBlock]
    /// Ids of locked blocks the agent had that the extension didn't send.
    public var restored: [String]
}

/// Merges the extension's blocks into the agent's copy.
///
/// The extension's list wins (it already enforces the lock rules on every edit),
/// except that a block which is locked in the agent's copy can't disappear: the
/// extension never deletes a locked block, so a missing one means storage was
/// wiped or the extension reinstalled. Those blocks are kept and sent back.
public func mergeForSync(stored: [StoredBlock], incoming: [StoredBlock], now: Date,
                         calendar: Calendar = .current) -> SyncResult {
    let incomingIDs = Set(incoming.compactMap(\.id))
    let restored = stored.filter { entry in
        guard let block = entry.block, !incomingIDs.contains(block.id) else { return false }
        return isLocked(block, at: now, calendar: calendar)
    }
    return SyncResult(blocks: incoming + restored, restored: restored.compactMap(\.id))
}
