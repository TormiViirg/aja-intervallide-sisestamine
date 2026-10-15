/**
 * Multi-team workspace.
 *
 * Several managed teams can be selected at once; every edit is written to all of them.
 * Deselecting a team parks it (the app saves its draft through the repository port), and
 * a parked team can be resumed exclusively. Teams edited jointly carry a "needs review"
 * counter that is cleared only once the admin views that team on its own — the overview
 * warns about any team still carrying it.
 */
import type { LocationId, TeamId } from './brand';
import { type DayEntry, EMPTY_ENTRY, type Field, fieldWall, isEmpty, sameEntry, setField } from './interval';
import type { ScheduleStatus } from './publish';
import type { DateRange } from './schedule';
import { type DateKey, type UtcIso, type WallTime, weekdayIndex } from './time';

export type EntryMap = Readonly<Record<DateKey, DayEntry>>;

export interface TeamSchedule {
  readonly teamId: TeamId;
  readonly entries: EntryMap;
  /** Last saved version — the baseline the U-turn button restores. */
  readonly saved: EntryMap;
  /** What volunteers currently see, or null if never published. */
  readonly published: EntryMap | null;
  readonly changedAt: Readonly<Record<DateKey, UtcIso>>;
  readonly status: ScheduleStatus;
  readonly jointEditsUnreviewed: number;
}

export interface Workspace {
  readonly teams: Readonly<Record<TeamId, TeamSchedule>>;
  readonly selected: readonly TeamId[];
  readonly range: DateRange;
  readonly locationIds: readonly LocationId[];
  /** Weekday columns (0 = Monday) locked against mass overwrite ("tablock"). */
  readonly locks: readonly number[];
}

export type WorkspaceAction =
  | { type: 'LOAD'; workspace: Workspace }
  | { type: 'SET_FIELD'; date: DateKey; field: Field; minutes: WallTime | null; now: UtcIso }
  | { type: 'APPLY_MASS'; dates: readonly DateKey[]; values: Partial<Record<Field, WallTime>>; now: UtcIso }
  | { type: 'REVERT_FIELD'; date: DateKey; field: Field; now: UtcIso }
  | { type: 'SELECT_TEAMS'; teamIds: readonly TeamId[] }
  | { type: 'MARK_SAVED'; teamIds: readonly TeamId[] }
  | { type: 'MARK_PUBLISHED'; teamIds: readonly TeamId[]; status: ScheduleStatus }
  | { type: 'SET_RANGE'; range: DateRange }
  | { type: 'SET_LOCATIONS'; locationIds: readonly LocationId[] }
  | { type: 'TOGGLE_LOCK'; weekday: number };

export const entryOf = (t: TeamSchedule, d: DateKey): DayEntry => t.entries[d] ?? EMPTY_ENTRY;

export function isLocked(ws: Workspace, date: DateKey): boolean {
  return ws.locks.includes(weekdayIndex(date));
}

function writeTeams(
  ws: Workspace,
  now: UtcIso,
  update: (team: TeamSchedule) => Record<DateKey, DayEntry>,
): Workspace {
  const joint = ws.selected.length > 1;
  const teams = { ...ws.teams };
  for (const id of ws.selected) {
    const team = teams[id];
    if (!team) continue;
    const patch = update(team);
    const changed = Object.entries(patch).filter(([d, e]) => !sameEntry(entryOf(team, d as DateKey), e));
    if (!changed.length) continue;
    const changedAt = { ...team.changedAt };
    for (const [d] of changed) changedAt[d as DateKey] = now;
    teams[id] = {
      ...team,
      entries: { ...team.entries, ...Object.fromEntries(changed) },
      changedAt,
      jointEditsUnreviewed: team.jointEditsUnreviewed + (joint ? changed.length : 0),
    };
  }
  return { ...ws, teams };
}

export function workspaceReducer(ws: Workspace, action: WorkspaceAction): Workspace {
  switch (action.type) {
    case 'LOAD':
      return action.workspace;
    case 'SET_FIELD':
      return writeTeams(ws, action.now, (t) => ({
        [action.date]: setField(action.date, entryOf(t, action.date), action.field, action.minutes),
      }));
    case 'APPLY_MASS': {
      const dates = action.dates.filter((d) => !isLocked(ws, d));
      return writeTeams(ws, action.now, (t) =>
        Object.fromEntries(
          dates.map((d) => {
            let e = entryOf(t, d);
            // Start first so the end is resolved against the new start (overnight rule).
            if (action.values.start !== undefined) e = setField(d, e, 'start', action.values.start);
            if (action.values.end !== undefined) e = setField(d, e, 'end', action.values.end);
            return [d, e];
          }),
        ),
      );
    }
    case 'REVERT_FIELD':
      return writeTeams(ws, action.now, (t) => {
        const saved = t.saved[action.date] ?? EMPTY_ENTRY;
        return {
          [action.date]: setField(action.date, entryOf(t, action.date), action.field, fieldWall(action.date, saved, action.field)),
        };
      });
    case 'SELECT_TEAMS': {
      const selected = action.teamIds.filter((id) => id in ws.teams);
      if (selected.length !== 1) return { ...ws, selected };
      const only = selected[0] as TeamId;
      const team = ws.teams[only] as TeamSchedule;
      return { ...ws, selected, teams: { ...ws.teams, [only]: { ...team, jointEditsUnreviewed: 0 } } };
    }
    case 'MARK_SAVED':
      return mapTeams(ws, action.teamIds, (t) => ({ ...t, saved: t.entries }));
    case 'MARK_PUBLISHED':
      return mapTeams(ws, action.teamIds, (t) => ({
        ...t,
        saved: t.entries,
        status: action.status,
        published: action.status.kind === 'published' ? t.entries : t.published,
      }));
    case 'SET_RANGE':
      return { ...ws, range: action.range };
    case 'SET_LOCATIONS':
      return { ...ws, locationIds: action.locationIds };
    case 'TOGGLE_LOCK':
      return {
        ...ws,
        locks: ws.locks.includes(action.weekday)
          ? ws.locks.filter((w) => w !== action.weekday)
          : [...ws.locks, action.weekday].sort(),
      };
    default: {
      const never: never = action;
      return never;
    }
  }
}

function mapTeams(ws: Workspace, ids: readonly TeamId[], fn: (t: TeamSchedule) => TeamSchedule): Workspace {
  const teams = { ...ws.teams };
  for (const id of ids) if (teams[id]) teams[id] = fn(teams[id]);
  return { ...ws, teams };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectedTeams(ws: Workspace): TeamSchedule[] {
  return ws.selected.flatMap((id) => (ws.teams[id] ? [ws.teams[id]] : []));
}

/** The first selected team drives legend colours and the U-turn baseline. */
export function primaryTeam(ws: Workspace): TeamSchedule | undefined {
  return selectedTeams(ws)[0];
}

export type FieldView =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly minutes: WallTime }
  | { readonly kind: 'mixed' };

export function viewField(ws: Workspace, date: DateKey, field: Field): FieldView {
  const values = selectedTeams(ws).map((t) => fieldWall(date, entryOf(t, date), field));
  if (!values.length) return { kind: 'empty' };
  const first = values[0] ?? null;
  if (values.some((v) => v !== first)) return { kind: 'mixed' };
  return first === null ? { kind: 'empty' } : { kind: 'value', minutes: first };
}

/** The saved value the U-turn would restore, when the field overwrote an already chosen time. */
export function revertTarget(ws: Workspace, date: DateKey, field: Field): WallTime | null {
  const t = primaryTeam(ws);
  if (!t) return null;
  const saved = fieldWall(date, t.saved[date] ?? EMPTY_ENTRY, field);
  const now = fieldWall(date, entryOf(t, date), field);
  return saved !== null && saved !== now ? saved : null;
}

export function isDirty(t: TeamSchedule): boolean {
  const keys = new Set([...Object.keys(t.entries), ...Object.keys(t.saved)]) as Set<DateKey>;
  for (const d of keys) if (!sameEntry(entryOf(t, d), t.saved[d] ?? EMPTY_ENTRY)) return true;
  return false;
}

export interface DayChange {
  readonly date: DateKey;
  /** null when the day has never been published. */
  readonly before: DayEntry | null;
  readonly after: DayEntry;
}

/** Differences against what volunteers currently see (or against nothing, if never published). */
export function changesSincePublish(t: TeamSchedule, days: readonly DateKey[]): DayChange[] {
  return days.flatMap((d): DayChange[] => {
    const before = t.published?.[d] ?? null;
    const after = entryOf(t, d);
    if (before === null) return isEmpty(after) ? [] : [{ date: d, before, after }];
    return sameEntry(before, after) ? [] : [{ date: d, before, after }];
  });
}

export function parkedTeams(ws: Workspace): TeamSchedule[] {
  return Object.values(ws.teams).filter((t) => !ws.selected.includes(t.teamId));
}
