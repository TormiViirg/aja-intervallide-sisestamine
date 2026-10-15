/**
 * Store + selectors against the mock backend data
 * ┌────────────────────────────┬──────────────────────────────────────────────────────────────┐
 * │ aspect                     │ cases                                                        │
 * ├────────────────────────────┼──────────────────────────────────────────────────────────────┤
 * │ mass apply (store)         │ keepStart → end only · keep both → no-op · locked skipped    │
 * │                            │ marks recorded per field · new values → new batch grey       │
 * │                            │ hand edit removes that field’s mark · no team → no-op        │
 * │ board (mock data)          │ Mon–Sun columns always · Sunday cards from Sunday openings   │
 * │                            │ no locations → 0 days but still 7 columns                    │
 * │                            │ 27.10 edited after publish → 17 affected / 3 notified        │
 * │                            │ 31.10 overnight, 26.10 before opening, recency classes       │
 * │ visible volunteers         │ festival filter internal: previous-festival volunteer hidden │
 * │                            │ Artis-only volunteer appears only when Artis selected        │
 * │ overview                   │ joint edit → review warning for both teams                   │
 * └────────────────────────────┴──────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import { ARTIS, buildLedger, buildOpeningTimes, buildSubmissions, buildVolunteers, buildWorkspace, LOCATIONS, PIIKSUTAJAD, PILETIKONTROLL, TEAMS } from '../adapters/mock/data';
import { CURRENT_FESTIVAL, ELIGIBILITY_WINDOW, FEEDBACK_THRESHOLDS } from '../config/runtime';
import { fieldWall } from '../domain/interval';
import { toDateKey, toUtcIso, type WallTime } from '../domain/time';
import { entryOf } from '../domain/workspace';
import { TEST_NOW } from '../test/testPorts';
import type { ReferenceData } from './ports';
import { buildBoard, buildOverview } from './selectors';
import { appReducer, type AppState, DEFAULT_MASS } from './store';

const ref: ReferenceData = {
  festivalId: CURRENT_FESTIVAL,
  locations: LOCATIONS,
  teams: TEAMS,
  openingTimes: buildOpeningTimes(),
  eligibility: ELIGIBILITY_WINDOW,
  feedbackThresholds: FEEDBACK_THRESHOLDS,
};
const volunteers = buildVolunteers();
const submissions = buildSubmissions(volunteers);
const NOW = toUtcIso(TEST_NOW);
const fresh = (): AppState => ({ ws: { ...buildWorkspace(TEST_NOW), locks: [] }, ledger: buildLedger(), mass: DEFAULT_MASS });
const MON = toDateKey('2026-10-26');
const TUE = toDateKey('2026-10-27');
const endOf = (s: AppState, d = MON) => fieldWall(d, entryOf(s.ws.teams[PIIKSUTAJAD]!, d), 'end');
const startOf = (s: AppState, d = MON) => fieldWall(d, entryOf(s.ws.teams[PIIKSUTAJAD]!, d), 'start');

describe('appReducer mass overwrite', () => {
  const apply = (s: AppState, dates = [MON, TUE]) => appReducer(s, { type: 'MASS_APPLY', dates, surroundings: [0.925], now: NOW });

  it('with "leave start alone" writes only ends and marks only ends', () => {
    const s = apply(fresh());
    expect(endOf(s)).toBe(DEFAULT_MASS.end);
    expect(startOf(s)).toBe(8 * 60);
    expect(s.ledger.marks[MON]).toEqual({ end: s.ledger.phase === 'open' ? s.ledger.active : -1 });
  });

  it('leaving both alone is a no-op', () => {
    const s0 = appReducer(fresh(), { type: 'MASS_SET', patch: { keepEnd: true } });
    expect(apply(s0)).toBe(s0);
  });

  it('skips locked weekdays', () => {
    const locked = appReducer(fresh(), { type: 'TOGGLE_LOCK', weekday: 0 });
    const s = apply(locked);
    expect(endOf(s, MON)).toBe(20 * 60);
    expect(endOf(s, TUE)).toBe(DEFAULT_MASS.end);
    expect(s.ledger.marks[MON]).toBeUndefined();
  });

  it('changing the values starts a new batch with a different grey', () => {
    const a = apply(fresh(), [MON]);
    const b = apply(appReducer(a, { type: 'MASS_SET', patch: { end: (22 * 60) as WallTime } }), [TUE]);
    const greys = new Set(Object.values(b.ledger.batches).map((x) => x.lightness));
    expect(b.ledger.marks[MON]?.end).not.toBe(b.ledger.marks[TUE]?.end);
    expect(greys.size).toBe(Object.keys(b.ledger.batches).length);
  });

  it('a hand edit removes the mass mark for that field', () => {
    const s = appReducer(apply(fresh(), [MON]), { type: 'SET_FIELD', date: MON, field: 'end', minutes: (19 * 60) as WallTime, now: NOW });
    expect(s.ledger.marks[MON]).toBeUndefined();
  });

  it('does nothing without a selected team', () => {
    const s0 = appReducer(fresh(), { type: 'SELECT_TEAMS', teamIds: [] });
    expect(apply(s0)).toBe(s0);
  });
});

describe('buildBoard with mock data', () => {
  const board = (s = fresh()) => buildBoard(s, ref, volunteers, submissions, TEST_NOW);

  it('always has Monday–Sunday columns; Sundays get cards from their opening times', () => {
    expect(board().columns).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(board().days).toHaveLength(30);
    expect(board().cards.get(toDateKey('2026-11-01'))?.openings.map((o) => o.time)).toEqual([11 * 60, 11 * 60 + 30]);
  });

  it('keeps all seven columns for a one-day period', () => {
    const s = appReducer(fresh(), { type: 'SET_RANGE', range: { from: toDateKey('2026-11-04'), to: toDateKey('2026-11-04') } });
    expect(board(s).columns).toHaveLength(7);
    expect(board(s).days).toEqual(['2026-11-04']);
  });

  it('shows no days and nobody when no location is selected', () => {
    const s = appReducer(fresh(), { type: 'SET_LOCATIONS', locationIds: [] });
    expect(board(s).days).toEqual([]);
    expect(board(s).columns).toHaveLength(7);
    expect(board(s).visibleVolunteers).toEqual([]);
  });

  it('27.10 overwritten after publishing: 17 affected, 3 to notify', () => {
    const card = board().cards.get(TUE)!;
    expect(card.legend.republished).toBe(true);
    expect([card.impact?.affected.length, card.impact?.notify.length]).toEqual([17, 3]);
    expect(card.revert.end).toBe(22 * 60 + 30);
  });

  it('classifies the design’s legend examples', () => {
    const b = board();
    expect(b.cards.get(toDateKey('2026-10-31'))?.legend.overnight).toBe(true);
    expect(b.cards.get(MON)?.legend).toMatchObject({ beforeOpening: true, recency: 'older' });
    expect(b.cards.get(toDateKey('2026-10-29'))?.legend.recency).toBe('day');
    expect(b.cards.get(toDateKey('2026-11-16'))?.legend.recency).toBe('threeDays');
    expect(b.cards.get(toDateKey('2026-10-28'))?.marks).toEqual({ start: null, end: 0.5 });
  });

  it('hides the previous festival’s volunteer and the Artis-only volunteer', () => {
    const names = board().visibleVolunteers.map((v) => v.name);
    expect(names).not.toContain('Vana Vabatahtlik');
    expect(names).not.toContain('Grete Lind');
    const withArtis = appReducer(fresh(), { type: 'SET_LOCATIONS', locationIds: [ARTIS] });
    expect(board(withArtis).visibleVolunteers.map((v) => v.name)).toEqual(['Grete Lind']);
  });

  it('progress counts complete intervals only', () => {
    expect(board().progress).toEqual({ done: 15, total: 30 });
  });
});

describe('buildOverview', () => {
  it('warns about both teams after a joint edit, until each is viewed alone', () => {
    let s = appReducer(fresh(), { type: 'SELECT_TEAMS', teamIds: [PIIKSUTAJAD, PILETIKONTROLL] });
    s = appReducer(s, { type: 'SET_FIELD', date: MON, field: 'start', minutes: (7 * 60 + 15) as WallTime, now: NOW });
    const o = buildOverview(s, ref, volunteers, submissions);
    expect(o.teams.map((t) => t.unreviewedJointEdits)).toEqual([1, 1]);
    s = appReducer(s, { type: 'SELECT_TEAMS', teamIds: [PILETIKONTROLL] });
    const o2 = buildOverview(s, ref, volunteers, submissions);
    expect(o2.teams[0]?.unreviewedJointEdits).toBe(0);
    expect(o2.parked).toEqual([PIIKSUTAJAD]);
  });

  it('only counts impact on published days', () => {
    const o = buildOverview(fresh(), ref, volunteers, submissions);
    const t = o.teams[0]!;
    expect(t.affected).toHaveLength(17);
    expect(t.notify).toHaveLength(3);
    expect(t.changes.find((c) => c.date === '2026-10-28')?.before).toBeNull();
  });
});
