/**
 * Legend rules — equivalence partitions / boundary values
 * ┌────────────────────────┬───────────────────────────────────────┬──────────────────────────────┐
 * │ rule                   │ class                                 │ boundary tested              │
 * ├────────────────────────┼───────────────────────────────────────┼──────────────────────────────┤
 * │ recency (age = now−t)  │ never changed                         │ undefined                    │
 * │                        │ [0, 24 h)  → day                      │ 0, 24 h − 1 ms               │
 * │                        │ [24 h, 72 h) → threeDays              │ 24 h, 72 h − 1 ms            │
 * │                        │ ≥ 72 h → older                        │ 72 h, 30 days                │
 * │                        │ future (clock skew) → day             │ −1 h                         │
 * │ starts before opening  │ start < earliest opening              │ 08:00 vs 09:45               │
 * │                        │ start == opening (not before)         │ 10:50 vs 10:50               │
 * │                        │ between two openings (before one)     │ 10:30 vs 09:45 / 10:50       │
 * │                        │ after all openings                    │ 11:00                        │
 * │                        │ 1 min before                          │ 10:49 vs 10:50               │
 * │                        │ no start / no openings                │ null, []                     │
 * │ overnight              │ ends next day after 00:00             │ 01:59                        │
 * │                        │ ends exactly 00:00 next day           │ 00:00 → false                │
 * │                        │ ends same day                         │ 20:00                        │
 * │ republished            │ never published / equal / different   │                              │
 * └────────────────────────┴───────────────────────────────────────┴──────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import type { LocationId } from './brand';
import { crossesMidnight, EMPTY_ENTRY, setField } from './interval';
import { type OpeningTime, openingsFor, overwrittenAfterPublish, recencyOf, startsBeforeOpening } from './legend';
import { HOUR_MS, toDateKey, toUtcIso, type WallTime, wallToUtc } from './time';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const ago = (ms: number) => toUtcIso(NOW - ms);
const D = toDateKey('2026-10-29');
const SOLARIS = 'solaris' as LocationId;
const PLAZA = 'coca-cola-plaza' as LocationId;
const hm = (h: number, m = 0) => (h * 60 + m) as WallTime;
const entry = (start: WallTime | null, end: WallTime | null = null) =>
  setField(D, setField(D, EMPTY_ENTRY, 'start', start), 'end', end);
const openings: OpeningTime[] = [
  { locationId: SOLARIS, date: D, opensAt: wallToUtc(D, hm(9, 45)) },
  { locationId: PLAZA, date: D, opensAt: wallToUtc(D, hm(10, 50)) },
];

describe('recencyOf', () => {
  it.each([
    ['never changed', undefined, 'none'],
    ['just now', ago(0), 'day'],
    ['24 h − 1 ms', ago(24 * HOUR_MS - 1), 'day'],
    ['exactly 24 h', ago(24 * HOUR_MS), 'threeDays'],
    ['72 h − 1 ms', ago(72 * HOUR_MS - 1), 'threeDays'],
    ['exactly 72 h', ago(72 * HOUR_MS), 'older'],
    ['30 days', ago(30 * 24 * HOUR_MS), 'older'],
    ['1 h in the future', ago(-HOUR_MS), 'day'],
  ] as const)('%s → %s', (_label, changedAt, expected) => {
    expect(recencyOf(changedAt, NOW)).toBe(expected);
  });
});

describe('startsBeforeOpening', () => {
  it.each([
    ['08:00, before both', hm(8), true],
    ['10:30, before Coca-Cola Plaza only', hm(10, 30), true],
    ['10:49, one minute before', hm(10, 49), true],
    ['10:50, equal to latest opening', hm(10, 50), false],
    ['11:00, after both', hm(11), false],
  ])('%s', (_l, start, expected) => {
    expect(startsBeforeOpening(entry(start), openings)).toBe(expected);
  });

  it('is false without a start', () => {
    expect(startsBeforeOpening(entry(null, hm(20)), openings)).toBe(false);
  });

  it('is false when no selected location opens that day', () => {
    expect(startsBeforeOpening(entry(hm(8)), openingsFor(D, openings, []))).toBe(false);
  });

  it('only considers selected locations', () => {
    expect(startsBeforeOpening(entry(hm(10, 30)), openingsFor(D, openings, [SOLARIS]))).toBe(false);
  });
});

describe('crossesMidnight', () => {
  it.each([
    ['10:30 → 01:59 next day', hm(10, 30), hm(1, 59), true],
    ['09:30 → 00:30 next day', hm(9, 30), hm(0, 30), true],
    ['20:00 → 00:00 ends exactly at midnight', hm(20), hm(0), false],
    ['08:00 → 20:00 same day', hm(8), hm(20), false],
    ['no start, end 01:00 (same day)', null, hm(1), false],
  ])('%s', (_l, s, e, expected) => {
    expect(crossesMidnight(D, entry(s, e))).toBe(expected);
  });
});

describe('overwrittenAfterPublish', () => {
  const a = entry(hm(10), hm(20));
  it('is false when the day was never published', () => expect(overwrittenAfterPublish(a, undefined)).toBe(false));
  it('is false when equal to the published value', () => expect(overwrittenAfterPublish(a, a)).toBe(false));
  it('is true when changed', () => expect(overwrittenAfterPublish(entry(hm(10), hm(21, 45)), a)).toBe(true));
  it('is false when both are empty', () => expect(overwrittenAfterPublish(EMPTY_ENTRY, EMPTY_ENTRY)).toBe(false));
});
