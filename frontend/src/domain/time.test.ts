/**
 * Equivalence partitions / boundary values
 * ┌──────────────────────┬──────────────────────────────────────────────┬───────────────────────────┐
 * │ input                │ class                                        │ representative / boundary │
 * ├──────────────────────┼──────────────────────────────────────────────┼───────────────────────────┤
 * │ parseWallTime        │ valid HH:MM                                  │ 00:00 (low), 23:59 (high) │
 * │                      │ hour out of range                            │ 24:00                     │
 * │                      │ minute out of range                          │ 12:60                     │
 * │                      │ alternate separators / no separator          │ 8.30, 0830, " 8:30 "      │
 * │                      │ garbage                                      │ "", "ab:cd", "1:2"        │
 * │ wallToUtc            │ winter (EET, +2)                             │ 2026-11-06                │
 * │                      │ summer (EEST, +3)                            │ 2026-10-01                │
 * │                      │ DST end, repeated hour → earlier instant     │ 2026-10-25 03:30          │
 * │                      │ DST start, skipped hour → forward            │ 2026-03-29 03:30          │
 * │ isDateKey            │ real date / impossible date / leap day       │ 2026-02-29 ✗, 2028-02-29 ✓│
 * └──────────────────────┴──────────────────────────────────────────────┴───────────────────────────┘
 * The suite runs with TZ=America/New_York (vite.config.ts) to prove nothing depends on the host zone.
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  eachDay,
  formatStamp,
  isDateKey,
  parseWallTime,
  tallinnDayBoundsMs,
  toDateKey,
  utcToWall,
  wallToUtc,
  weekdayIndex,
  HOUR_MS,
} from './time';

describe('parseWallTime', () => {
  it.each([
    ['00:00', 0],
    ['23:59', 23 * 60 + 59],
    ['08:30', 510],
    ['8:30', 510],
    ['8.30', 510],
    ['0830', 510],
    [' 8:30 ', 510],
  ])('accepts %j as %i minutes', (input, minutes) => {
    expect(parseWallTime(input)).toBe(minutes);
  });

  it.each(['24:00', '12:60', '', 'ab:cd', '1:2', '123:00', '-1:00'])('rejects %j', (input) => {
    expect(parseWallTime(input)).toBeNull();
  });
});

describe('Tallinn ↔ UTC', () => {
  it('uses +2 h in winter', () => {
    expect(wallToUtc(toDateKey('2026-11-06'), 10 * 60 + 50)).toBe('2026-11-06T08:50:00.000Z');
  });

  it('uses +3 h in summer', () => {
    expect(wallToUtc(toDateKey('2026-10-01'), 9 * 60)).toBe('2026-10-01T06:00:00.000Z');
  });

  it('resolves the repeated hour at DST end to the earlier instant', () => {
    expect(wallToUtc(toDateKey('2026-10-25'), 3 * 60 + 30)).toBe('2026-10-25T00:30:00.000Z');
  });

  it('moves a time inside the skipped DST hour forward', () => {
    expect(wallToUtc(toDateKey('2026-03-29'), 3 * 60 + 30)).toBe('2026-03-29T01:30:00.000Z');
  });

  it('round-trips wall time', () => {
    const iso = wallToUtc(toDateKey('2026-10-29'), 23 * 60 + 59);
    expect(utcToWall(iso)).toEqual({ date: '2026-10-29', minutes: 23 * 60 + 59 });
  });

  it('gives a 25 h day when DST ends', () => {
    const [a, b] = tallinnDayBoundsMs(toDateKey('2026-10-25'));
    expect(b - a).toBe(25 * HOUR_MS);
  });

  it('formats status stamps in Estonian time', () => {
    expect(formatStamp(wallToUtc(toDateKey('2026-10-24'), 23 * 60 + 59))).toBe('23:59 24.10.2026');
  });
});

describe('calendar helpers', () => {
  it.each([
    ['2026-10-26', true],
    ['2026-02-29', false],
    ['2028-02-29', true],
    ['2026-13-01', false],
    ['26.10.2026', false],
  ])('isDateKey(%s) = %s', (input, ok) => expect(isDateKey(input)).toBe(ok));

  it('counts Monday as weekday 0 and Sunday as 6', () => {
    expect(weekdayIndex(toDateKey('2026-10-26'))).toBe(0);
    expect(weekdayIndex(toDateKey('2026-11-01'))).toBe(6);
  });

  it('crosses month ends', () => {
    expect(addDays(toDateKey('2026-10-31'), 1)).toBe('2026-11-01');
  });

  it('returns an empty list for a reversed range and one day for a single-day range', () => {
    expect(eachDay(toDateKey('2026-10-27'), toDateKey('2026-10-26'))).toEqual([]);
    expect(eachDay(toDateKey('2026-10-26'), toDateKey('2026-10-26'))).toEqual(['2026-10-26']);
  });
});
