import Foundation

// Ports of isScheduledAt / isBlockActive (src/core/schedule.ts) and isLocked
// (src/core/locks.ts). tests/fixtures/lock-semantics.json is run against both.

public func isScheduled(_ schedule: [ScheduleWindow], at now: Date, calendar: Calendar = .current) -> Bool {
    let parts = calendar.dateComponents([.weekday, .hour, .minute], from: now)
    let day = parts.weekday! - 1 // Calendar weekdays are 1 = Sunday … 7 = Saturday
    let minute = parts.hour! * 60 + parts.minute!
    return schedule.contains { $0.day == day && minute >= $0.start && minute < $0.end }
}

public func isBlockActive(_ block: Block, at now: Date, calendar: Calendar = .current) -> Bool {
    if let until = block.runningUntil, until > now.epochMilliseconds { return true }
    return isScheduled(block.schedule, at: now, calendar: calendar)
}

public func isLocked(_ block: Block, at now: Date, calendar: Calendar = .current) -> Bool {
    guard isBlockActive(block, at: now, calendar: calendar) else { return false }
    switch block.lock {
    case .none: return false
    case .timer(let until): return now.epochMilliseconds < until
    case .randomText, .untilEnd: return true
    }
}
