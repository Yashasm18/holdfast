import Foundation
import Testing
@testable import HoldfastAgentCore

// Runs tests/fixtures/lock-semantics.json, the same file src/core/fixtures.test.ts runs.
struct FixtureCase: Decodable, CustomTestStringConvertible {
    struct FixtureLock: Decodable { var type: String; var untilMinutes: Double?; var length: Int? }
    struct FixtureBlock: Decodable { var schedule: [ScheduleWindow]; var runningUntilMinutes: Double?; var lock: FixtureLock }
    struct Expect: Decodable, Equatable { var active: Bool; var locked: Bool }

    var name: String
    var now: String
    var block: FixtureBlock
    var expect: Expect

    var testDescription: String { name }

    /// `now` is local wall-clock time without a zone, like `new Date("2026-10-21T10:30")` in JS.
    var date: Date {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return formatter.date(from: now)!
    }

    func makeBlock() -> Block {
        let nowMs = date.epochMilliseconds
        let at = { (minutes: Double) in nowMs + minutes * 60_000 }
        let lock: Lock = switch block.lock.type {
        case "timer": .timer(until: at(block.lock.untilMinutes!))
        case "randomText": .randomText(length: block.lock.length!)
        case "untilEnd": .untilEnd
        default: .none
        }
        return Block(id: "fixture", name: name, schedule: block.schedule,
                     runningUntil: block.runningUntilMinutes.map(at), lock: lock)
    }
}

let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()

let fixtureCases: [FixtureCase] = {
    struct File: Decodable { var cases: [FixtureCase] }
    let url = repoRoot.appendingPathComponent("tests/fixtures/lock-semantics.json")
    return try! JSONDecoder().decode(File.self, from: Data(contentsOf: url)).cases
}()

@Suite struct LockSemanticsTests {
    @Test func fixturesLoaded() {
        #expect(fixtureCases.count >= 10)
    }

    @Test(arguments: fixtureCases)
    func matchesTypeScriptCore(_ fixture: FixtureCase) {
        let block = fixture.makeBlock()
        let result = FixtureCase.Expect(active: isBlockActive(block, at: fixture.date),
                                        locked: isLocked(block, at: fixture.date))
        #expect(result == fixture.expect)
    }

    @Test func decodesExtensionJSON() throws {
        let json = """
        {"id":"b1","name":"Work","websites":["youtube.com"],"exceptions":[],"apps":["com.valvesoftware.steam"],
         "schedule":[{"day":1,"start":540,"end":1020}],"runningUntil":null,"lock":{"type":"timer","until":1761041400000}}
        """
        let block = try JSONDecoder().decode(Block.self, from: Data(json.utf8))
        #expect(block.apps == ["com.valvesoftware.steam"])
        #expect(block.lock == .timer(until: 1_761_041_400_000))
        #expect(block.schedule == [ScheduleWindow(day: 1, start: 540, end: 1020)])
    }

    @Test func blocksFromOlderExtensionsHaveNoApps() throws {
        let block = try JSONDecoder().decode(Block.self, from: Data(#"{"id":"b","lock":{"type":"none"}}"#.utf8))
        #expect(block.apps.isEmpty)
        #expect(block.runningUntil == nil)
    }
}
