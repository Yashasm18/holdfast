import Foundation
import Testing
@testable import HoldfastAgentCore

func tempPaths() -> AgentPaths {
    AgentPaths(home: FileManager.default.temporaryDirectory
        .appendingPathComponent("holdfast-tests-\(UUID().uuidString)", isDirectory: true))
}

func rawBlock(_ id: String, runningUntil: Double? = nil, lock: String = #"{"type":"none"}"#, extra: String = "") -> JSONValue {
    let until = runningUntil.map { String(format: "%.0f", $0) } ?? "null"
    let json = #"{"id":"\#(id)","name":"\#(id)","websites":["\#(id).com"],"exceptions":[],"schedule":[],"runningUntil":\#(until),"lock":\#(lock)\#(extra)}"#
    return try! JSONValue.parse(Data(json.utf8))
}

@Suite struct SyncTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    var inAnHour: Double { now.epochMilliseconds + 3_600_000 }

    @Test func extensionListWinsWhenNothingIsLocked() {
        let stored = [rawBlock("old")].map(StoredBlock.init(raw:))
        let incoming = [rawBlock("new")].map(StoredBlock.init(raw:))
        let result = mergeForSync(stored: stored, incoming: incoming, now: now)
        #expect(result.blocks.map(\.id) == ["new"])
        #expect(result.restored.isEmpty)
    }

    @Test func lockedBlocksMissingFromTheExtensionAreRestored() {
        let locked = rawBlock("locked", runningUntil: inAnHour, lock: #"{"type":"untilEnd"}"#)
        let unlocked = rawBlock("unlocked", runningUntil: inAnHour)
        let stored = [locked, unlocked].map(StoredBlock.init(raw:))
        let result = mergeForSync(stored: stored, incoming: [], now: now)
        #expect(result.restored == ["locked"])
        #expect(result.blocks.map(\.raw) == [locked])
    }

    @Test func extensionVersionOfALockedBlockIsKept() {
        let stored = [rawBlock("b", runningUntil: inAnHour, lock: #"{"type":"untilEnd"}"#)].map(StoredBlock.init(raw:))
        let stricter = rawBlock("b", runningUntil: inAnHour * 2, lock: #"{"type":"untilEnd"}"#)
        let result = mergeForSync(stored: stored, incoming: [StoredBlock(raw: stricter)], now: now)
        #expect(result.blocks.map(\.raw) == [stricter])
        #expect(result.restored.isEmpty)
    }

    @Test func unknownFieldsSurviveTheRoundTrip() throws {
        let paths = tempPaths()
        let block = rawBlock("b", extra: #","futureField":{"x":[1,true,null]}"#)
        try BlockStore.save([StoredBlock(raw: block)], to: paths)
        #expect(BlockStore.load(paths).map(\.raw) == [block])
    }

    @Test func nativeHostSyncStoresBlocksAndRemembersTheExtension() throws {
        let paths = tempPaths()
        let locked = rawBlock("locked", runningUntil: inAnHour, lock: #"{"type":"randomText","length":30}"#)
        try BlockStore.save([StoredBlock(raw: locked)], to: paths)

        let incoming = rawBlock("fresh")
        let reply = NativeHost.handle(.object(["type": .string("sync"), "blocks": .array([incoming])]),
                                      origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
                                      paths: paths, now: now)

        #expect(reply["type"] == .string("synced"))
        #expect(reply["restored"] == .array([.string("locked")]))
        #expect(reply["blocks"] == .array([incoming, locked]))
        #expect(BlockStore.load(paths).map(\.raw) == [incoming, locked])
        #expect(BlockStore.loadExtensionIDs(paths) == ["abcdefghijklmnopabcdefghijklmnop"])
    }

    @Test func nativeHostRejectsUnknownMessages() {
        let reply = NativeHost.handle(.object(["type": .string("delete-everything")]), origin: "", paths: tempPaths())
        #expect(reply["type"] == .string("error"))
    }
}

@Suite struct NativeMessagingTests {
    @Test func framesRoundTrip() throws {
        let message = JSONValue.object(["type": .string("sync"), "blocks": .array([])])
        var buffer = try NativeMessaging.frame(message)
        #expect(buffer.prefix(4) == Data([UInt8(buffer.count - 4), 0, 0, 0]))
        let read = { (count: Int) -> Data in
            let chunk = buffer.prefix(count)
            buffer = buffer.dropFirst(count)
            return Data(chunk)
        }
        #expect(try NativeMessaging.read(using: read) == message)
        #expect(try NativeMessaging.read(using: read) == nil)
    }

    @Test func truncatedInputIsAnError() {
        var buffer = Data([10, 0, 0, 0]) + Data("{}".utf8)
        let read = { (count: Int) -> Data in
            let chunk = buffer.prefix(count)
            buffer = buffer.dropFirst(count)
            return Data(chunk)
        }
        #expect(throws: NativeMessaging.FramingError.truncated) { try NativeMessaging.read(using: read) }
    }

    @Test func extensionIDFromOrigin() {
        #expect(NativeMessaging.extensionID(fromOrigin: "chrome-extension://heobnbeibkeonkmhacjdplleondionnd/")
            == "heobnbeibkeonkmhacjdplleondionnd")
        #expect(NativeMessaging.extensionID(fromOrigin: "https://example.com/") == nil)
    }
}
