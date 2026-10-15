/**
 * Eligibility window & grid building — equivalence partitions / boundary values
 * The window comes from src/config/runtime.ts (ELIGIBILITY_WINDOW) — the same value the app uses,
 * so changing the config re-targets these tests.
 * ┌──────────────────────┬────────────────────────────────────────────┬─────────────────────────────┐
 * │ input                │ class                                      │ boundary                    │
 * ├──────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
 * │ day vs window        │ day before window                          │ first day − 1               │
 * │                      │ first eligible day                         │ day start == fromUtc        │
 * │                      │ last eligible day                          │ day end == untilUtc         │
 * │                      │ day after window                           │ last day + 1                │
 * │                      │ window starting 1 ms into a day            │ that day ✗, next day ✓      │
 * │ range                │ to < from, from == to, ineligible ends     │                             │
 * │ buildDays            │ day with/without opening for selected locs │ Sunday without openings     │
 * └──────────────────────┴────────────────────────────────────────────┴─────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import { ELIGIBILITY_WINDOW } from '../config/runtime';
import type { LocationId } from './brand';
import { EMPTY_ENTRY, setField } from './interval';
import type { OpeningTime } from './legend';
import {
  buildDays,
  groupIntoWeeks,
  isDayEligible,
  rangeProblems,
  splitMinutes,
  totalMinutes,
  weekdayColumns,
} from './schedule';
import { addDays, tallinnDateOf, toDateKey, toUtcIso, utcMs, type WallTime, wallToUtc } from './time';

const first = tallinnDateOf(utcMs(ELIGIBILITY_WINDOW.fromUtc));
const last = addDays(tallinnDateOf(utcMs(ELIGIBILITY_WINDOW.untilUtc)), -1);

describe('isDayEligible with the configured window', () => {
  it('rejects the day before the window', () => expect(isDayEligible(addDays(first, -1), ELIGIBILITY_WINDOW)).toBe(false));
  it('accepts the first day (day start == fromUtc)', () => expect(isDayEligible(first, ELIGIBILITY_WINDOW)).toBe(true));
  it('accepts the last day (day end == untilUtc)', () => expect(isDayEligible(last, ELIGIBILITY_WINDOW)).toBe(true));
  it('rejects the day after the window', () => expect(isDayEligible(addDays(last, 1), ELIGIBILITY_WINDOW)).toBe(false));
  it('configured window is 1 Oct … 30 Nov 2026', () => {
    expect([first, last]).toEqual(['2026-10-01', '2026-11-30']);
  });

  it('rejects a day the window only partly covers (window starts 1 ms after midnight)', () => {
    const w = { fromUtc: toUtcIso(utcMs(ELIGIBILITY_WINDOW.fromUtc) + 1), untilUtc: ELIGIBILITY_WINDOW.untilUtc };
    expect(isDayEligible(first, w)).toBe(false);
    expect(isDayEligible(addDays(first, 1), w)).toBe(true);
  });
});

describe('rangeProblems', () => {
  const d = (s: string) => toDateKey(s);
  it('accepts a single-day range', () => expect(rangeProblems({ from: d('2026-10-26'), to: d('2026-10-26') }, ELIGIBILITY_WINDOW)).toEqual([]));
  it('flags a reversed range', () =>
    expect(rangeProblems({ from: d('2026-10-27'), to: d('2026-10-26') }, ELIGIBILITY_WINDOW)).toEqual(['endBeforeStart']));
  it('flags ineligible ends', () =>
    expect(rangeProblems({ from: d('2026-09-30'), to: d('2026-12-01') }, ELIGIBILITY_WINDOW)).toEqual([
      'startNotEligible',
      'endNotEligible',
    ]));
});

describe('buildDays / weeks', () => {
  const S = 'solaris' as LocationId;
  const P = 'plaza' as LocationId;
  const range = { from: toDateKey('2026-10-26'), to: toDateKey('2026-11-02') };
  const openings: OpeningTime[] = ['2026-10-26', '2026-10-27', '2026-10-31', '2026-11-02'].map((k) => ({
    locationId: S,
    date: toDateKey(k),
    opensAt: wallToUtc(toDateKey(k), 600),
  }));
  openings.push({ locationId: P, date: toDateKey('2026-10-28'), opensAt: wallToUtc(toDateKey('2026-10-28'), 600) });

  it('keeps only days on which a selected location opens', () => {
    expect(buildDays(range, openings, [S])).toEqual(['2026-10-26', '2026-10-27', '2026-10-31', '2026-11-02']);
    expect(buildDays(range, openings, [S, P])).toContain('2026-10-28');
    expect(buildDays(range, openings, [])).toEqual([]);
  });

  it('derives columns and week rows (no Sunday column without Sunday openings)', () => {
    const days = buildDays(range, openings, [S, P]);
    expect(weekdayColumns(days)).toEqual([0, 1, 2, 5]);
    const weeks = groupIntoWeeks(days);
    expect(weeks.map((w) => w.monday)).toEqual(['2026-10-26', '2026-11-02']);
    expect(weeks[1]?.byWeekday.get(0)).toBe('2026-11-02');
  });

  it('sums complete windows per week and ignores incomplete ones', () => {
    const a = toDateKey('2026-10-26');
    const b = toDateKey('2026-10-27');
    const entries = {
      [a]: setField(a, setField(a, EMPTY_ENTRY, 'start', 480 as WallTime), 'end', 1200 as WallTime),
      [b]: setField(b, EMPTY_ENTRY, 'end', 1305 as WallTime),
    };
    expect(totalMinutes([a, b], entries)).toBe(720);
    expect(splitMinutes(1425)).toEqual({ hours: 23, minutes: 45 });
  });
});
