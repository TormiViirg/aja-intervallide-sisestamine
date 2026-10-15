/**
 * Turning a collection period into the grid of interval components.
 */
import type { LocationId } from './brand';
import { type DayEntry, durationMinutes, EMPTY_ENTRY } from './interval';
import type { OpeningTime } from './legend';
import {
  type DateKey,
  eachDay,
  mondayOf,
  tallinnDayBoundsMs,
  utcMs,
  type UtcIso,
  weekdayIndex,
} from './time';

export interface DateRange {
  readonly from: DateKey;
  readonly to: DateKey;
}

/** Bounds supplied by the backend for which days may be picked at all (UTC, inclusive start, exclusive end). */
export interface EligibilityWindow {
  readonly fromUtc: UtcIso;
  readonly untilUtc: UtcIso;
}

/**
 * A Tallinn calendar day is eligible only when the whole day lies inside the window:
 *   dayStart ≥ fromUtc  and  dayEnd ≤ untilUtc.
 */
export function isDayEligible(date: DateKey, window: EligibilityWindow): boolean {
  const [start, end] = tallinnDayBoundsMs(date);
  return start >= utcMs(window.fromUtc) && end <= utcMs(window.untilUtc);
}

export type RangeProblem = 'endBeforeStart' | 'startNotEligible' | 'endNotEligible';

export function rangeProblems(range: DateRange, window: EligibilityWindow): RangeProblem[] {
  const problems: RangeProblem[] = [];
  if (range.to < range.from) problems.push('endBeforeStart');
  if (!isDayEligible(range.from, window)) problems.push('startNotEligible');
  if (!isDayEligible(range.to, window)) problems.push('endNotEligible');
  return problems;
}

/**
 * One interval component per day in the range on which at least one selected
 * location has an opening time (the superadmin did not open Sundays in the mock data,
 * which is why the design has no Sunday column).
 */
export function buildDays(
  range: DateRange,
  openings: readonly OpeningTime[],
  locationIds: readonly LocationId[],
): DateKey[] {
  const wanted = new Set(locationIds);
  const open = new Set(openings.filter((o) => wanted.has(o.locationId)).map((o) => o.date));
  return eachDay(range.from, range.to).filter((d) => open.has(d));
}

/** Weekday columns (0 = Monday) that occur in the day list. */
export function weekdayColumns(days: readonly DateKey[]): number[] {
  return [...new Set(days.map(weekdayIndex))].sort((a, b) => a - b);
}

export interface WeekRow {
  readonly monday: DateKey;
  readonly byWeekday: ReadonlyMap<number, DateKey>;
}

export function groupIntoWeeks(days: readonly DateKey[]): WeekRow[] {
  const rows = new Map<DateKey, Map<number, DateKey>>();
  for (const d of days) {
    const key = mondayOf(d);
    const row = rows.get(key) ?? new Map<number, DateKey>();
    row.set(weekdayIndex(d), d);
    rows.set(key, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([monday, byWeekday]) => ({ monday, byWeekday }));
}

export function totalMinutes(days: Iterable<DateKey>, entries: Readonly<Record<DateKey, DayEntry>>): number {
  let sum = 0;
  for (const d of days) sum += durationMinutes(entries[d] ?? EMPTY_ENTRY) ?? 0;
  return sum;
}

export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
