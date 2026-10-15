/**
 * Interval entry — equivalence partitions / boundary values
 * ┌───────────────────────┬────────────────────────────────────────┬────────────────────────────┐
 * │ input                 │ class                                  │ boundary                   │
 * ├───────────────────────┼────────────────────────────────────────┼────────────────────────────┤
 * │ end vs start          │ end > start → same day                 │ start+1 min                │
 * │                       │ end < start → next day                 │ start−1 min                │
 * │                       │ end == start → next day + flagged      │ equal                      │
 * │ edit order            │ end first, start later re-resolves end │ 01:00 then start 10:00     │
 * │ duration              │ incomplete / DST-end day (+1 h real)   │ 2026-10-24 → 25            │
 * └───────────────────────┴────────────────────────────────────────┴────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import { durationMinutes, EMPTY_ENTRY, entryProblems, entryWall, setField } from './interval';
import { toDateKey, type WallTime } from './time';

const D = toDateKey('2026-11-06');
const hm = (h: number, m = 0) => (h * 60 + m) as WallTime;

describe('setField', () => {
  it('keeps the end on the same day when it is after the start (start + 1 min)', () => {
    const e = setField(D, setField(D, EMPTY_ENTRY, 'start', hm(10)), 'end', hm(10, 1));
    expect(entryWall(D, e)).toEqual({ start: hm(10), end: hm(10, 1), endDayOffset: 0 });
    expect(durationMinutes(e)).toBe(1);
  });

  it('moves the end to the next day when it is before the start (start − 1 min)', () => {
    const e = setField(D, setField(D, EMPTY_ENTRY, 'start', hm(10)), 'end', hm(9, 59));
    expect(entryWall(D, e).endDayOffset).toBe(1);
    expect(durationMinutes(e)).toBe(24 * 60 - 1);
  });

  it('treats an equal start and end as next day and flags it', () => {
    const e = setField(D, setField(D, EMPTY_ENTRY, 'start', hm(10)), 'end', hm(10));
    expect(entryWall(D, e).endDayOffset).toBe(1);
    expect(entryProblems(D, e)).toEqual(['sameStartEnd']);
  });

  it('re-resolves an existing end when the start is entered afterwards', () => {
    const endFirst = setField(D, EMPTY_ENTRY, 'end', hm(1));
    expect(entryWall(D, endFirst).endDayOffset).toBe(0);
    const withStart = setField(D, endFirst, 'start', hm(10));
    expect(entryWall(D, withStart)).toEqual({ start: hm(10), end: hm(1), endDayOffset: 1 });
  });

  it('clears a field with null', () => {
    const e = setField(D, setField(D, EMPTY_ENTRY, 'start', hm(10)), 'start', null);
    expect(e).toEqual(EMPTY_ENTRY);
  });

  it('measures real elapsed time across the DST change', () => {
    const day = toDateKey('2026-10-24');
    const e = setField(day, setField(day, EMPTY_ENTRY, 'start', hm(20)), 'end', hm(8));
    expect(durationMinutes(e)).toBe(13 * 60); // 12 h on the wall clock, 13 h elapsed
  });

  it('has no duration while incomplete', () => {
    expect(durationMinutes(setField(D, EMPTY_ENTRY, 'start', hm(10)))).toBeNull();
  });
});
