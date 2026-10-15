/**
 * Backend ⇄ frontend translation
 * ┌──────────────────────────┬──────────────────────────────────────────────────────────────────────┐
 * │ input                    │ classes / boundaries                                                 │
 * ├──────────────────────────┼──────────────────────────────────────────────────────────────────────┤
 * │ allowedRange             │ inclusive dates → [from 00:00, to+1 00:00) Tallinn; one-day range    │
 * │ opening times            │ memory shape (one global time) → every day · Supabase openingHours   │
 * │                          │ per date/location · null/invalid open dropped                        │
 * │ draft values → entries   │ complete · start only · end before start (next day) · invalid time  │
 * │                          │ dropped · empty {} skipped · non-date key ignored                    │
 * │ entries → values         │ outside allowed range dropped (from − 1, to + 1) · boundary dates    │
 * │                          │ kept · cleared day sent as {} · overnight keeps wall times           │
 * │ volunteers               │ same id in two teams merged · "A, B" locations split · festival tag  │
 * │ submissions              │ opened without times skipped · duplicates once · overnight next day  │
 * │ scheduled stamp          │ UTC → Estonian local "YYYY-MM-DDTHH:mm" in EET and EEST              │
 * └──────────────────────────┴──────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import type { FestivalId, TeamId } from '../../domain/brand';
import { EMPTY_ENTRY, entryWall, setField } from '../../domain/interval';
import { toDateKey, type WallTime, wallToUtc } from '../../domain/time';
import {
  type ConfigDto,
  eligibilityFromRange,
  entriesFromValues,
  locationsFromConfig,
  openingTimesFromConfig,
  submissionsFromDtos,
  tallinnLocalStamp,
  valuesFromEntries,
  volunteersFromDtos,
} from './backendMapping';

const memoryConfig: ConfigDto = {
  allowedRange: { from: '2026-10-26', to: '2026-10-28' },
  openingTimes: { open: '07:45', close: '19:45', cinema: 'Solaris' },
};
const supabaseConfig: ConfigDto = {
  ...memoryConfig,
  openingHours: [
    { date: '2026-10-26', open: '10:50', close: '23:00', location: 'Solaris' },
    { date: '2026-10-26', open: '09:45', close: '23:00', location: 'Coca-Cola Plaza' },
    { date: '2026-10-27', open: null, close: null, location: 'Solaris' },
    { date: 'not-a-date', open: '10:00', close: '11:00', location: 'Solaris' },
  ],
};
const hm = (h: number, m = 0) => (h * 60 + m) as WallTime;
const d = toDateKey;

describe('config', () => {
  it('turns the inclusive allowed range into a half-open Tallinn window', () => {
    expect(eligibilityFromRange(memoryConfig.allowedRange)).toEqual({
      fromUtc: '2026-10-25T22:00:00.000Z',
      untilUtc: '2026-10-28T22:00:00.000Z',
    });
  });

  it('handles a one-day range', () => {
    const w = eligibilityFromRange({ from: '2026-11-04', to: '2026-11-04' });
    expect(Date.parse(w.untilUtc) - Date.parse(w.fromUtc)).toBe(24 * 3600_000);
  });

  it('applies the in-memory repository’s single opening time to every day', () => {
    const o = openingTimesFromConfig(memoryConfig);
    expect(o.map((x) => x.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(o[0]).toEqual({ locationId: 'Solaris', date: '2026-10-26', opensAt: wallToUtc(d('2026-10-26'), hm(7, 45)) });
    expect(locationsFromConfig(memoryConfig)).toEqual(['Solaris']);
  });

  it('uses Supabase per-day opening hours and drops rows without a usable time or date', () => {
    const o = openingTimesFromConfig(supabaseConfig);
    expect(o.map((x) => `${x.date} ${x.locationId}`)).toEqual(['2026-10-26 Solaris', '2026-10-26 Coca-Cola Plaza']);
    expect(locationsFromConfig(supabaseConfig)).toEqual(['Solaris', 'Coca-Cola Plaza']);
  });
});

describe('draft values ⇄ entries', () => {
  it('reads complete, partial and overnight values and drops invalid ones', () => {
    const e = entriesFromValues({
      '2026-10-26': { start: '08:00', end: '20:00' },
      '2026-10-27': { start: '10:00', end: null },
      '2026-10-29': { start: '10:30', end: '01:59' },
      '2026-10-30': { start: '25:00', end: '26:00' },
      '2026-10-31': {},
      nonsense: { start: '08:00', end: '09:00' },
    });
    expect(Object.keys(e)).toEqual(['2026-10-26', '2026-10-27', '2026-10-29']);
    expect(entryWall(d('2026-10-29'), e[d('2026-10-29')]!)).toEqual({ start: hm(10, 30), end: hm(1, 59), endDayOffset: 1 });
    expect(entryWall(d('2026-10-27'), e[d('2026-10-27')]!).end).toBeNull();
  });

  it('writes wall times, keeps boundary dates, drops dates outside the allowed range', () => {
    const entry = (k: string, s: number, en: number) => setField(d(k), setField(d(k), EMPTY_ENTRY, 'start', s as WallTime), 'end', en as WallTime);
    const values = valuesFromEntries(
      {
        [d('2026-10-25')]: entry('2026-10-25', 480, 600),
        [d('2026-10-26')]: entry('2026-10-26', 630, 119),
        [d('2026-10-28')]: entry('2026-10-28', 480, 600),
        [d('2026-10-29')]: entry('2026-10-29', 480, 600),
      },
      memoryConfig.allowedRange,
    );
    expect(values).toEqual({ '2026-10-26': { start: '10:30', end: '01:59' }, '2026-10-28': { start: '08:00', end: '10:00' } });
  });

  it('sends a cleared day as {} so the server supersedes the old value', () => {
    const previous = entriesFromValues({ '2026-10-27': { start: '08:00', end: '09:00' } });
    expect(valuesFromEntries({}, memoryConfig.allowedRange, previous)).toEqual({ '2026-10-27': {} });
  });

  it('formats scheduled publishing in Estonian local time across DST', () => {
    expect(tallinnLocalStamp(wallToUtc(d('2026-10-24'), hm(23, 59)))).toBe('2026-10-24T23:59');
    expect(tallinnLocalStamp(wallToUtc(d('2026-11-02'), hm(9)))).toBe('2026-11-02T09:00');
  });
});

describe('volunteers', () => {
  const FEST = 'poff30' as FestivalId;
  const A = 'usher' as TeamId;
  const B = 'press' as TeamId;

  it('merges a volunteer listed under two teams and splits joined locations', () => {
    const v = volunteersFromDtos(
      [
        [A, [{ id: 7, name: 'Ольга', festival: '1', team: 'usher', location: 'Solaris, Coca-Cola Plaza', opened: [] }]],
        [B, [{ id: 7, name: 'Ольга', festival: '1', team: 'press', location: 'Solaris', opened: [] }]],
      ],
      FEST,
    );
    expect(v).toEqual([{ id: '7', name: 'Ольга', festivalId: FEST, teamIds: [A, B], locationIds: ['Solaris', 'Coca-Cola Plaza'] }]);
  });

  it('turns timed openings into submissions once, skipping day-only openings', () => {
    const dto = {
      id: 1,
      name: 'Mari',
      festival: 'poff30',
      team: 'usher',
      location: 'Solaris',
      opened: [
        { date: '2026-10-27', start: '19:00', end: '01:00' },
        { date: '2026-10-27', start: '19:00', end: '01:00' },
        { date: '2026-10-28' },
      ],
    };
    const s = submissionsFromDtos([dto, dto]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ volunteerId: '1', date: '2026-10-27', end: wallToUtc(d('2026-10-28'), hm(1)) });
  });
});
