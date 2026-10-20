/** Minutes since local midnight, 0..1440. */
export type MinuteOfDay = number;

/** 0 = Sunday … 6 = Saturday, matching Date#getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduleWindow {
  day: Weekday;
  start: MinuteOfDay;
  /** Exclusive. May be 1440 to mean "until midnight". */
  end: MinuteOfDay;
}

export type Lock =
  | { type: "none" }
  /** Cannot be stopped or weakened before `until` (epoch ms). */
  | { type: "timer"; until: number }
  /** Stopping requires typing `length` random characters exactly. */
  | { type: "randomText"; length: number }
  /** Cannot be stopped or weakened at all while the block is active. */
  | { type: "untilEnd" };

export interface Block {
  id: string;
  name: string;
  /** Domains, wildcard URL patterns, or bare keywords. */
  websites: string[];
  /** Patterns that are always allowed, even if a website pattern matches. */
  exceptions: string[];
  /** Weekly windows when the block runs. Empty = only runs when started manually. */
  schedule: ScheduleWindow[];
  /** Set when the block is started manually; epoch ms, or null when not running manually. */
  runningUntil: number | null;
  lock: Lock;
}
