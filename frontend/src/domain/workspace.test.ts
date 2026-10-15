/**
 * Multi-team workspace
 * ┌──────────────────────────────┬─────────────────────────────────────────────────────────────┐
 * │ behaviour                    │ cases                                                       │
 * ├──────────────────────────────┼─────────────────────────────────────────────────────────────┤
 * │ joint editing                │ 1 team → no review debt; 2 teams → both written + debt      │
 * │ mixed values                 │ teams differ → "mixed"; agree → value; none → empty         │
 * │ exclusive continue           │ selecting one team clears its debt only                     │
 * │ tablock                      │ locked weekday skipped by mass apply, manual edit allowed   │
 * │ U-turn                       │ shown only when a saved non-empty value was overwritten     │
 * │ dirty / save                 │ dirty after edit, clean after MARK_SAVED                    │
 * └──────────────────────────────┴─────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import type { TeamId } from './brand';
import { EMPTY_ENTRY, setField } from './interval';
import { toDateKey, toUtcIso, type WallTime } from './time';
import { isDirty, revertTarget, type TeamSchedule, viewField, type Workspace, workspaceReducer } from './workspace';

const A = 'a' as TeamId;
const B = 'b' as TeamId;
const MON = toDateKey('2026-10-26');
const TUE = toDateKey('2026-10-27');
const NOW = toUtcIso(Date.parse('2026-10-15T09:00:00Z'));
const hm = (h: number, m = 0) => (h * 60 + m) as WallTime;
const team = (id: TeamId, over: Partial<TeamSchedule> = {}): TeamSchedule => ({
  teamId: id,
  entries: {},
  saved: {},
  published: null,
  changedAt: {},
  status: { kind: 'draft' },
  jointEditsUnreviewed: 0,
  ...over,
});
const ws = (selected: TeamId[], over: Partial<Workspace> = {}): Workspace => ({
  teams: { [A]: team(A), [B]: team(B) },
  selected,
  range: { from: MON, to: TUE },
  locationIds: [],
  locks: [],
  ...over,
});
const set = (w: Workspace, date = MON, field: 'start' | 'end' = 'start', m = hm(8)) =>
  workspaceReducer(w, { type: 'SET_FIELD', date, field, minutes: m, now: NOW });

describe('joint editing', () => {
  it('a single team accrues no review debt', () => {
    expect(set(ws([A])).teams[A]?.jointEditsUnreviewed).toBe(0);
  });

  it('two teams are both written and both owe a review', () => {
    const w = set(ws([A, B]));
    expect(viewField(w, MON, 'start')).toEqual({ kind: 'value', minutes: hm(8) });
    expect(w.teams[A]?.jointEditsUnreviewed).toBe(1);
    expect(w.teams[B]?.jointEditsUnreviewed).toBe(1);
    expect(w.teams[A]?.changedAt[MON]).toBe(NOW);
  });

  it('reports mixed values when teams disagree', () => {
    const w = set(ws([A]));
    expect(viewField({ ...w, selected: [A, B] }, MON, 'start')).toEqual({ kind: 'mixed' });
    expect(viewField({ ...w, selected: [] }, MON, 'start')).toEqual({ kind: 'empty' });
  });

  it('continuing with one team clears only that team’s debt', () => {
    const w = workspaceReducer(set(ws([A, B])), { type: 'SELECT_TEAMS', teamIds: [B] });
    expect(w.teams[B]?.jointEditsUnreviewed).toBe(0);
    expect(w.teams[A]?.jointEditsUnreviewed).toBe(1);
  });

  it('ignores unknown team ids', () => {
    expect(workspaceReducer(ws([A]), { type: 'SELECT_TEAMS', teamIds: ['zzz' as TeamId] }).selected).toEqual([]);
  });
});

describe('tablock', () => {
  it('skips locked weekdays during mass apply', () => {
    const locked = workspaceReducer(ws([A]), { type: 'TOGGLE_LOCK', weekday: 0 });
    const w = workspaceReducer(locked, { type: 'APPLY_MASS', dates: [MON, TUE], values: { end: hm(21, 45) }, now: NOW });
    expect(viewField(w, MON, 'end')).toEqual({ kind: 'empty' });
    expect(viewField(w, TUE, 'end')).toEqual({ kind: 'value', minutes: hm(21, 45) });
  });

  it('still allows manual edits on a locked weekday', () => {
    const locked = workspaceReducer(ws([A]), { type: 'TOGGLE_LOCK', weekday: 0 });
    expect(viewField(set(locked), MON, 'start').kind).toBe('value');
  });

  it('toggles back off', () => {
    const w = workspaceReducer(workspaceReducer(ws([A]), { type: 'TOGGLE_LOCK', weekday: 2 }), { type: 'TOGGLE_LOCK', weekday: 2 });
    expect(w.locks).toEqual([]);
  });
});

describe('U-turn and saving', () => {
  const saved = setField(MON, EMPTY_ENTRY, 'start', hm(9));
  const base = ws([A], { teams: { [A]: team(A, { entries: { [MON]: saved }, saved: { [MON]: saved } }), [B]: team(B) } });

  it('offers no U-turn for an untouched field', () => expect(revertTarget(base, MON, 'start')).toBeNull());
  it('offers no U-turn when the saved value was empty', () => expect(revertTarget(set(base, MON, 'end'), MON, 'end')).toBeNull());

  it('offers the saved value after overwriting it and restores it', () => {
    const edited = set(base, MON, 'start', hm(11));
    expect(revertTarget(edited, MON, 'start')).toBe(hm(9));
    expect(isDirty(edited.teams[A] as TeamSchedule)).toBe(true);
    const back = workspaceReducer(edited, { type: 'REVERT_FIELD', date: MON, field: 'start', now: NOW });
    expect(viewField(back, MON, 'start')).toEqual({ kind: 'value', minutes: hm(9) });
    expect(isDirty(back.teams[A] as TeamSchedule)).toBe(false);
  });

  it('is clean after saving', () => {
    const w = workspaceReducer(set(base, MON, 'start', hm(11)), { type: 'MARK_SAVED', teamIds: [A] });
    expect(isDirty(w.teams[A] as TeamSchedule)).toBe(false);
    expect(revertTarget(w, MON, 'start')).toBeNull();
  });

  it('publishing now replaces the published version; scheduling keeps the old one visible', () => {
    const edited = set(base, MON, 'start', hm(11));
    const pub = workspaceReducer(edited, { type: 'MARK_PUBLISHED', teamIds: [A], status: { kind: 'published', at: NOW } });
    expect(pub.teams[A]?.published?.[MON]).toEqual(pub.teams[A]?.entries[MON]);
    const sch = workspaceReducer(edited, { type: 'MARK_PUBLISHED', teamIds: [A], status: { kind: 'scheduled', at: NOW } });
    expect(sch.teams[A]?.published).toBeNull();
  });
});
