/**
 * Volunteer filtering and live-feedback groups — equivalence partitions / boundary values.
 * Names deliberately mix Estonian, Russian and English to exercise collation.
 *
 * Filter (festival internal, team + locations from the UI)
 * ┌────┬──────────────────────────────────────────────────────────┬──────────┐
 * │ id │ class                                                    │ visible  │
 * ├────┼──────────────────────────────────────────────────────────┼──────────┤
 * │ F1 │ festival ✓, team ✓, location ✓                           │ yes      │
 * │ F2 │ other festival, team ✓, location ✓                       │ no       │
 * │ F3 │ festival ✓, team ✗                                       │ no       │
 * │ F4 │ festival ✓, team ✓, location ✗                           │ no       │
 * │ F5 │ several teams, one matches (partial intersection)        │ yes      │
 * │ F6 │ empty team selection                                     │ nobody   │
 * │ F7 │ empty location selection                                 │ nobody   │
 * │ F8 │ volunteer with no locations                              │ no       │
 * └────┴──────────────────────────────────────────────────────────┴──────────┘
 *
 * Groups (min = 600, margin = 120)
 * ┌──────────────┬─────────────┬──────────────────┐
 * │ total min    │ class       │ boundary         │
 * ├──────────────┼─────────────┼──────────────────┤
 * │ 0            │ unfilled    │ lower bound      │
 * │ 1            │ tooFew      │ just above 0     │
 * │ 599          │ tooFew      │ min − 1          │
 * │ 600          │ nearLimit   │ min              │
 * │ 719          │ nearLimit   │ min + margin − 1 │
 * │ 720          │ —           │ min + margin     │
 * │ share 0.59   │ not unusual │ threshold − ε    │
 * │ share 0.60   │ unusual     │ threshold        │
 * │ 1-day period │ never unusual│                 │
 * └──────────────┴─────────────┴──────────────────┘
 */
import { describe, expect, it } from 'vitest';
import type { FestivalId, LocationId, TeamId, VolunteerId } from './brand';
import { type DateKey, toDateKey, wallToUtc } from './time';
import {
  DEFAULT_THRESHOLDS,
  filterVolunteers,
  groupsFor,
  groupVolunteers,
  sortByName,
  statsFor,
  type Submission,
  unionLengthMs,
  type Volunteer,
} from './volunteers';

const FEST = 'poff-30' as FestivalId;
const OTHER = 'poff-29' as FestivalId;
const PIIKS = 'piiksutajad' as TeamId;
const VALGUS = 'valgustajad' as TeamId;
const SOL = 'solaris' as LocationId;
const PLAZA = 'plaza' as LocationId;
const v = (id: string, name: string, over: Partial<Volunteer> = {}): Volunteer => ({
  id: id as VolunteerId,
  name,
  festivalId: FEST,
  teamIds: [PIIKS],
  locationIds: [SOL],
  ...over,
});

const cases: Array<[string, Volunteer, boolean]> = [
  ['F1', v('1', 'Sipsik Kallis'), true],
  ['F2', v('2', 'Ольга Смирнова', { festivalId: OTHER }), false],
  ['F3', v('3', 'Oliver Grant', { teamIds: [VALGUS] }), false],
  ['F4', v('4', 'Lilleke Kuiva', { locationIds: [PLAZA] }), false],
  ['F5', v('5', 'Дмитрий Козлов', { teamIds: [VALGUS, PIIKS] }), true],
  ['F8', v('8', 'Juubel Tamm', { locationIds: [] }), false],
];

describe('filterVolunteers', () => {
  it.each(cases)('%s %s', (_id, vol, visible) => {
    const out = filterVolunteers([vol], { festivalId: FEST, teamIds: [PIIKS], locationIds: [SOL] });
    expect(out.length === 1).toBe(visible);
  });

  it('F6 empty team selection shows nobody', () => {
    expect(filterVolunteers(cases.map((c) => c[1]), { festivalId: FEST, teamIds: [], locationIds: [SOL] })).toEqual([]);
  });

  it('F7 empty location selection shows nobody', () => {
    expect(filterVolunteers(cases.map((c) => c[1]), { festivalId: FEST, teamIds: [PIIKS], locationIds: [] })).toEqual([]);
  });
});

describe('unionLengthMs', () => {
  it('merges overlaps, keeps gaps, and treats touching spans as contiguous', () => {
    expect(unionLengthMs([[0, 10], [5, 20], [20, 25], [30, 40]])).toBe(35);
  });
  it('ignores empty and reversed spans', () => {
    expect(unionLengthMs([[5, 5], [9, 3]])).toBe(0);
  });
});

describe('groupsFor', () => {
  const t = DEFAULT_THRESHOLDS;
  it.each([
    [0, ['unfilled']],
    [1, ['tooFew']],
    [599, ['tooFew']],
    [600, ['nearLimit']],
    [719, ['nearLimit']],
    [720, []],
  ])('%i minutes → %j', (m, expected) => {
    expect(groupsFor({ totalMinutes: m, largestDayShare: 0.2 }, t, 10)).toEqual(expected);
  });

  it.each([
    [0.59, false],
    [0.6, true],
    [1, true],
  ])('largest day share %f → unusual = %s', (share, unusual) => {
    expect(groupsFor({ totalMinutes: 900, largestDayShare: share }, t, 10).includes('unusual')).toBe(unusual);
  });

  it('never calls a one-day period unusual', () => {
    expect(groupsFor({ totalMinutes: 900, largestDayShare: 1 }, t, 1)).toEqual([]);
  });
});

describe('groupVolunteers', () => {
  const day = (k: string): DateKey => toDateKey(k);
  const sub = (id: string, d: string, h1: number, h2: number): Submission => ({
    volunteerId: id as VolunteerId,
    date: day(d),
    start: wallToUtc(day(d), h1 * 60),
    end: wallToUtc(day(d), h2 * 60),
  });
  const vols = [v('a', 'Ärni Õun'), v('b', 'Борис'), v('c', 'Zoe')];
  const subs = [sub('b', '2026-10-27', 10, 15), sub('c', '2026-10-27', 10, 15), sub('c', '2026-10-28', 10, 15), sub('c', '2026-12-01', 0, 20)];
  const days = new Set([day('2026-10-27'), day('2026-10-28')]);

  it('counts only submissions on days in the period', () => {
    const g = groupVolunteers(vols, subs, days);
    expect(g.unfilled.map((x) => x.id)).toEqual(['a']);
    expect(g.tooFew.map((x) => x.id)).toEqual(['b']);
    expect(g.nearLimit.map((x) => x.id)).toEqual(['c']);
    expect(g.unusual.map((x) => x.id)).toEqual(['b']);
  });

  it('computes stats with overlap removed', () => {
    expect(statsFor([sub('x', '2026-10-27', 10, 14), sub('x', '2026-10-27', 12, 16)]).totalMinutes).toBe(360);
  });

  it('sorts names with the UI locale collator', () => {
    const names = sortByName([v('1', 'Õie'), v('2', 'Oskar'), v('3', 'Zoja')], 'et').map((x) => x.name);
    expect(names).toEqual(['Oskar', 'Zoja', 'Õie']); // Estonian puts Õ after Z
  });
});
