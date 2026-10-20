import type { Block, ScheduleWindow } from "./types";

export function isScheduledAt(schedule: readonly ScheduleWindow[], now: number): boolean {
  const date = new Date(now);
  const day = date.getDay();
  const minute = date.getHours() * 60 + date.getMinutes();
  return schedule.some((w) => w.day === day && minute >= w.start && minute < w.end);
}

export function isBlockActive(block: Block, now: number): boolean {
  return (block.runningUntil !== null && block.runningUntil > now) || isScheduledAt(block.schedule, now);
}

/** 7×1440 bitmap of scheduled minutes, used to compare schedules by coverage. */
export function scheduleCoverage(schedule: readonly ScheduleWindow[]): Uint8Array {
  const minutes = new Uint8Array(7 * 1440);
  for (const w of schedule) minutes.fill(1, w.day * 1440 + w.start, w.day * 1440 + w.end);
  return minutes;
}
