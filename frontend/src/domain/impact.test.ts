/**
 * Impact of editing a published day — equivalence partitions / boundary values
 * Published window W₀ = 10:00–21:45. Submission S per volunteer.
 * ┌────┬───────────────────────────────────────────────┬──────────┬────────┐
 * │ id │ class                                         │ affected │ notify │
 * ├────┼───────────────────────────────────────────────┼──────────┼────────┤
 * │ I1 │ unchanged day                                 │ no       │ no     │
 * │ I2 │ end shrinks into S                            │ yes      │ yes    │
 * │ I3 │ end shrinks exactly to S.end (touching)       │ yes      │ no     │
 * │ I4 │ end shrinks to S.end − 1 min                  │ yes      │ yes    │
 * │ I5 │ window only grows                             │ yes      │ no     │
 * │ I6 │ window cleared                                │ yes      │ yes    │
 * │ I7 │ day never published                           │ no       │ no     │
 * │ I8 │ volunteer with no submission that day         │ no       │ no     │
 * │ I9 │ two submissions, one touched → counted once   │ yes (1)  │ yes(1) │
 * └────┴───────────────────────────────────────────────┴──────────┴────────┘
 */
import { describe, expect, it } from 'vitest';
import type { VolunteerId } from './brand';
import { dayImpact, subtract, summarizeImpact } from './impact';
import { EMPTY_ENTRY, setField } from './interval';
import { toDateKey, type WallTime, wallToUtc } from './time';
import type { Submission } from './volunteers';

const D = toDateKey('2026-10-27');
const hm = (h: number, m = 0) => (h * 60 + m) as WallTime;
const win = (s: number, e: number) => setField(D, setField(D, EMPTY_ENTRY, 'start', s as WallTime), 'end', e as WallTime);
const W0 = win(hm(10), hm(21, 45));
const S = (id: string, a: WallTime, b: WallTime, date = D): Submission => ({
  volunteerId: id as VolunteerId,
  date,
  start: wallToUtc(date, a),
  end: wallToUtc(date, b),
});
const anna = S('anna', hm(18), hm(21));

describe('dayImpact', () => {
  it('I1 unchanged day affects nobody', () => {
    expect(dayImpact(D, W0, W0, [anna])).toMatchObject({ affected: [], notify: [] });
  });
  it('I2 shrinking into a submission notifies', () => {
    expect(dayImpact(D, W0, win(hm(10), hm(20)), [anna])).toMatchObject({ affected: ['anna'], notify: ['anna'] });
  });
  it('I3 shrinking exactly to the submission end only affects', () => {
    expect(dayImpact(D, W0, win(hm(10), hm(21)), [anna])).toMatchObject({ affected: ['anna'], notify: [] });
  });
  it('I4 one minute further notifies', () => {
    expect(dayImpact(D, W0, win(hm(10), hm(20, 59)), [anna])).toMatchObject({ notify: ['anna'] });
  });
  it('I5 growing the window never notifies', () => {
    expect(dayImpact(D, W0, win(hm(8), hm(23)), [anna])).toMatchObject({ affected: ['anna'], notify: [] });
  });
  it('I6 clearing the window notifies everyone with a submission', () => {
    expect(dayImpact(D, W0, EMPTY_ENTRY, [anna])).toMatchObject({ notify: ['anna'] });
  });
  it('I7 a never-published day has no impact', () => {
    expect(dayImpact(D, undefined, win(hm(8), hm(9)), [anna])).toMatchObject({ affected: [], notify: [] });
  });
  it('I8 submissions on other days are ignored', () => {
    const other = S('olga', hm(10), hm(12), toDateKey('2026-10-28'));
    expect(dayImpact(D, W0, win(hm(11), hm(20)), [other])).toMatchObject({ affected: [], notify: [] });
  });
  it('I9 a volunteer is counted once', () => {
    const twice = [S('ivan', hm(10), hm(11)), S('ivan', hm(19), hm(21))];
    const r = dayImpact(D, W0, win(hm(10), hm(20)), twice);
    expect([r.affected, r.notify]).toEqual([['ivan'], ['ivan']]);
  });
});

describe('subtract / summarizeImpact', () => {
  it('splits a span around a hole', () => expect(subtract([0, 10], [3, 5])).toEqual([[0, 3], [5, 10]]));
  it('leaves disjoint spans alone, touching included', () => expect(subtract([0, 10], [10, 20])).toEqual([[0, 10]]));
  it('removes everything when covered', () => expect(subtract([2, 4], [0, 10])).toEqual([]));
  it('deduplicates volunteers across days', () => {
    const s = summarizeImpact([
      { date: D, affected: ['a', 'b'] as VolunteerId[], notify: ['a'] as VolunteerId[] },
      { date: toDateKey('2026-10-28'), affected: ['a'] as VolunteerId[], notify: [] },
    ]);
    expect([s.affected.length, s.notify.length, s.days.length]).toEqual([2, 1, 2]);
  });
});
