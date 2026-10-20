import Foundation

/// Chrome's native messaging framing: a 32-bit length in native byte order
/// (little-endian on every Mac) followed by that many bytes of UTF-8 JSON.
public enum NativeMessaging {
    /// Chrome refuses messages from a host larger than 1 MB.
    public static let maxOutgoing = 1024 * 1024
    /// Messages to a host can be up to 64 MiB.
    public static let maxIncoming = 64 * 1024 * 1024

    public enum FramingError: Error, Equatable {
        case truncated
        case tooLarge(Int)
    }

    public static func frame(_ message: JSONValue) throws -> Data {
        let body = try message.data()
        guard body.count <= maxOutgoing else { throw FramingError.tooLarge(body.count) }
        var length = UInt32(body.count).littleEndian
        return Data(bytes: &length, count: 4) + body
    }

    /// Reads one framed message. Returns nil at a clean end of input.
    public static func read(using readBytes: (Int) -> Data) throws -> JSONValue? {
        let header = readBytes(4)
        if header.isEmpty { return nil }
        guard header.count == 4 else { throw FramingError.truncated }
        let length = Int(header.withUnsafeBytes { UInt32(littleEndian: $0.loadUnaligned(as: UInt32.self)) })
        guard length <= maxIncoming else { throw FramingError.tooLarge(length) }
        let body = readBytes(length)
        guard body.count == length else { throw FramingError.truncated }
        return try JSONValue.parse(body)
    }

    /// The extension ID from the origin Chrome passes as the host's first argument
    /// (`chrome-extension://<id>/`).
    public static func extensionID(fromOrigin origin: String) -> String? {
        let prefix = "chrome-extension://"
        guard origin.hasPrefix(prefix) else { return nil }
        let id = origin.dropFirst(prefix.count).split(separator: "/").first.map(String.init) ?? ""
        return id.isEmpty ? nil : id
    }
}

/// Answers one message from the extension. Runs in the short-lived process Chrome
/// starts for each `chrome.runtime.sendNativeMessage` call.
public enum NativeHost {
    public static func handle(_ message: JSONValue, origin: String, paths: AgentPaths, now: Date = Date()) -> JSONValue {
        if let id = NativeMessaging.extensionID(fromOrigin: origin) {
            try? BlockStore.rememberExtensionID(id, in: paths)
        }
        switch message["type"]?.stringValue {
        case "sync":
            guard let incoming = message["blocks"]?.arrayValue else { return error("sync needs a blocks array") }
            let result = mergeForSync(stored: BlockStore.load(paths), incoming: incoming.map(StoredBlock.init(raw:)), now: now)
            do {
                try BlockStore.save(result.blocks, to: paths)
            } catch {
                return self.error("couldn't save blocks: \(error.localizedDescription)")
            }
            return .object([
                "type": .string("synced"),
                "blocks": .array(result.blocks.map(\.raw)),
                "restored": .array(result.restored.map(JSONValue.string)),
            ])
        case "ping":
            return .object(["type": .string("pong"), "version": .string(agentVersion)])
        default:
            return error("unknown message type")
        }
    }

    private static func error(_ message: String) -> JSONValue {
        .object(["type": .string("error"), "message": .string(message)])
    }
}

public let agentVersion = "0.3.0"
/// The native messaging host name, registered for each browser by install.sh.
public let nativeHostName = "app.holdfast.agent"
/// The extension's ID, pinned by the `key` in static/manifest.json.
public let defaultExtensionID = "heobnbeibkeonkmhacjdplleondionnd"
