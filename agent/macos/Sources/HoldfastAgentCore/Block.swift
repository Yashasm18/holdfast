import Foundation

// Swift mirror of src/core/types.ts. Only the fields the agent acts on are modelled;
// the raw JSON is kept alongside (see BlockStore) so nothing is lost when writing back.

public struct ScheduleWindow: Codable, Equatable, Sendable {
    /// 0 = Sunday … 6 = Saturday, matching JavaScript's Date#getDay().
    public var day: Int
    /// Minutes since local midnight, inclusive.
    public var start: Int
    /// Minutes since local midnight, exclusive. May be 1440 for "until midnight".
    public var end: Int

    public init(day: Int, start: Int, end: Int) {
        self.day = day
        self.start = start
        self.end = end
    }
}

public enum Lock: Equatable, Sendable {
    case none
    /// Cannot be stopped before `until` (epoch milliseconds).
    case timer(until: Double)
    case randomText(length: Int)
    case untilEnd
}

extension Lock: Codable {
    private enum CodingKeys: String, CodingKey { case type, until, length }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "timer": self = .timer(until: try container.decode(Double.self, forKey: .until))
        case "randomText": self = .randomText(length: try container.decode(Int.self, forKey: .length))
        case "untilEnd": self = .untilEnd
        // An unknown lock from a newer extension is treated as the strictest kind.
        case "none": self = .none
        default: self = .untilEnd
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .none:
            try container.encode("none", forKey: .type)
        case .timer(let until):
            try container.encode("timer", forKey: .type)
            try container.encode(until, forKey: .until)
        case .randomText(let length):
            try container.encode("randomText", forKey: .type)
            try container.encode(length, forKey: .length)
        case .untilEnd:
            try container.encode("untilEnd", forKey: .type)
        }
    }
}

public struct Block: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    /// macOS bundle IDs to quit while the block is active.
    public var apps: [String]
    public var schedule: [ScheduleWindow]
    /// Epoch milliseconds, or nil when not running manually.
    public var runningUntil: Double?
    public var lock: Lock

    public init(id: String, name: String = "", apps: [String] = [], schedule: [ScheduleWindow] = [],
                runningUntil: Double? = nil, lock: Lock = .none) {
        self.id = id
        self.name = name
        self.apps = apps
        self.schedule = schedule
        self.runningUntil = runningUntil
        self.lock = lock
    }

    private enum CodingKeys: String, CodingKey { case id, name, apps, schedule, runningUntil, lock }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        apps = try container.decodeIfPresent([String].self, forKey: .apps) ?? []
        schedule = try container.decodeIfPresent([ScheduleWindow].self, forKey: .schedule) ?? []
        runningUntil = try container.decodeIfPresent(Double.self, forKey: .runningUntil)
        lock = try container.decodeIfPresent(Lock.self, forKey: .lock) ?? .none
    }
}

extension Date {
    /// Milliseconds since 1970, the unit the extension stores times in.
    public var epochMilliseconds: Double { timeIntervalSince1970 * 1000 }
}
