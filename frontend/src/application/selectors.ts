/**
 * Pure view-model builders. Components render these and never touch domain rules directly.
 */
import type { TeamId, VolunteerId } from '../domain/brand';
import { dayImpact, type DayImpact, summarizeImpact } from '../domain/impact';
import { type DayEntry, EMPTY_ENTRY, entryProblems, entryWall, type EntryProblem, isComplete, isEmpty } from '../domain/interval';
import { type DayLegend, legendFor, openingsFor, startsBeforeOpening } from '../domain/legend';
import { colorsOnDay, type LedgerState, previewNextLightness } from '../domain/markLedger';
import { MIDNIGHT_HALO_LIGHTNESS, RECENCY_LIGHTNESS } from '../domain/oklch';
import type { ScheduleStatus } from '../domain/publish';
import { buildDays, groupIntoWeeks, totalMinutes, type WeekRow } from '../domain/schedule';

export const ALL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
import { addDays, type DateKey, utcToWall, type WallTime, weekdayIndex } from '../domain/time';
import { filterVolunteers, type Submission, submittersPerDay, type Volunteer } from '../domain/volunteers';
import {
  changesSincePublish,
  type DayChange,
  entryOf,
  type FieldView,
  isLocked,
  parkedTeams,
  primaryTeam,
  revertTarget,
  selectedTeams,
  type TeamSchedule,
  viewField,
  type Workspace,
} from '../domain/workspace';
import type { ReferenceData } from './ports';
import type { AppState } from './store';

export interface CardModel {
  readonly date: DateKey;
  readonly weekday: number;
  readonly start: FieldView;
  readonly end: FieldView;
  /** Weekday index of the end when it falls on the next day, else null. */
  readonly endWeekday: number | null;
  readonly legend: DayLegend;
  readonly marks: { readonly start: number | null; readonly end: number | null };
  readonly openings: ReadonlyArray<{ readonly location: string; readonly time: WallTime }>;
  readonly submitters: number;
  readonly impact: DayImpact | null;
  readonly revert: { readonly start: WallTime | null; readonly end: WallTime | null };
  readonly locked: boolean;
  readonly problems: readonly EntryProblem[];
}

export interface BoardModel {
  readonly days: readonly DateKey[];
  readonly columns: readonly number[];
  readonly weeks: readonly WeekRow[];
  readonly cards: ReadonlyMap<DateKey, CardModel>;
  readonly weekTotals: ReadonlyMap<DateKey, number>;
  /** Lightness of every legend colour on the visible days — input for the next batch grey. */
  readonly surroundings: readonly number[];
  readonly nextBatchLightness: number;
  readonly progress: { readonly done: number; readonly total: number };
  readonly visibleVolunteers: readonly Volunteer[];
}

export function visibleVolunteers(ws: Workspace, ref: ReferenceData, volunteers: readonly Volunteer[]): Volunteer[] {
  return filterVolunteers(volunteers, { festivalId: ref.festivalId, teamIds: ws.selected, locationIds: ws.locationIds });
}

function lightnessOfBatch(ledger: LedgerState, id: number | undefined): number | null {
  return id === undefined ? null : (ledger.batches[id]?.lightness ?? null);
}

export function buildBoard(
  state: AppState,
  ref: ReferenceData,
  volunteers: readonly Volunteer[],
  submissions: readonly Submission[],
  nowMs: number,
): BoardModel {
  const { ws, ledger } = state;
  const days = buildDays(ws.range, ref.openingTimes, ws.locationIds);
  const team = primaryTeam(ws);
  const visible = visibleVolunteers(ws, ref, volunteers);
  const visibleIds = new Set(visible.map((v) => v.id));
  const subs = submissions.filter((s) => visibleIds.has(s.volunteerId));
  const perDay = submittersPerDay(subs, visibleIds);
  const locationName = new Map(ref.locations.map((l) => [l.id, l.name]));
  const surroundings = new Set<number>();
  const cards = new Map<DateKey, CardModel>();

  for (const date of days) {
    const entry: DayEntry = team ? entryOf(team, date) : EMPTY_ENTRY;
    const published = team?.published ? team.published[date] : undefined;
    const dayOpenings = openingsFor(date, ref.openingTimes, ws.locationIds);
    const legend = legendFor({ date, entry, published, changedAt: team?.changedAt[date], dayOpenings, nowMs });
    surroundings.add(RECENCY_LIGHTNESS[legend.recency]);
    if (legend.overnight) surroundings.add(MIDNIGHT_HALO_LIGHTNESS);
    colorsOnDay(ledger, date).forEach((l) => surroundings.add(l));
    const wall = entryWall(date, entry);
    const marks = ledger.marks[date];
    cards.set(date, {
      date,
      weekday: weekdayIndex(date),
      start: viewField(ws, date, 'start'),
      end: viewField(ws, date, 'end'),
      endWeekday: wall.endDayOffset === 1 && wall.end !== null ? weekdayIndex(addDays(date, 1)) : null,
      legend,
      marks: { start: lightnessOfBatch(ledger, marks?.start), end: lightnessOfBatch(ledger, marks?.end) },
      openings: [...dayOpenings]
        .sort((a, b) => (a.opensAt < b.opensAt ? -1 : 1))
        .map((o) => ({ location: locationName.get(o.locationId) ?? o.locationId, time: utcToWall(o.opensAt).minutes })),
      submitters: perDay.get(date) ?? 0,
      impact: legend.republished ? dayImpact(date, published, entry, subs) : null,
      revert: { start: revertTarget(ws, date, 'start'), end: revertTarget(ws, date, 'end') },
      locked: isLocked(ws, date),
      problems: entryProblems(date, entry),
    });
  }

  const weeks = groupIntoWeeks(days);
  const weekTotals = new Map(
    weeks.map((w) => [w.monday, team ? totalMinutes(w.byWeekday.values(), team.entries) : 0] as const),
  );
  const surroundingList = [...surroundings];
  return {
    days,
    // Monday–Sunday always: a short period fills the matching columns, the grid never reflows.
    columns: ALL_WEEKDAYS,
    weeks,
    cards,
    weekTotals,
    surroundings: surroundingList,
    nextBatchLightness: previewNextLightness(ledger, surroundingList),
    progress: { done: team ? days.filter((d) => isComplete(entryOf(team, d))).length : 0, total: days.length },
    visibleVolunteers: visible,
  };
}

/** Status shown in the header: shared status of the selected teams, or "mixed". */
export function headerStatus(ws: Workspace): ScheduleStatus | { kind: 'mixed' } | null {
  const teams = selectedTeams(ws);
  const first = teams[0];
  if (!first) return null;
  const same = teams.every((t) => t.status.kind === first.status.kind && ('at' in t.status ? t.status.at : null) === ('at' in first.status ? first.status.at : null));
  return same ? first.status : { kind: 'mixed' };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface OverviewChange extends DayChange {
  readonly impact: DayImpact;
}

export interface TeamOverview {
  readonly teamId: TeamId;
  readonly changes: readonly OverviewChange[];
  readonly affected: readonly VolunteerId[];
  readonly notify: readonly VolunteerId[];
  readonly unreviewedJointEdits: number;
  readonly beforeOpeningDays: number;
  readonly incompleteDays: number;
}

export interface OverviewModel {
  readonly teams: readonly TeamOverview[];
  readonly parked: readonly TeamId[];
  readonly names: ReadonlyMap<VolunteerId, string>;
}

export function buildOverview(
  state: AppState,
  ref: ReferenceData,
  volunteers: readonly Volunteer[],
  submissions: readonly Submission[],
): OverviewModel {
  const { ws } = state;
  const days = buildDays(ws.range, ref.openingTimes, ws.locationIds);
  const visible = visibleVolunteers(ws, ref, volunteers);
  const ids = new Set(visible.map((v) => v.id));
  const subs = submissions.filter((s) => ids.has(s.volunteerId));
  const teams = selectedTeams(ws).map((t: TeamSchedule): TeamOverview => {
    const changes = changesSincePublish(t, days).map((c) => ({
      ...c,
      // Only a day volunteers could see (published) can have opened intervals to disturb.
      impact: dayImpact(c.date, t.published?.[c.date], c.after, subs),
    }));
    const summary = summarizeImpact(changes.map((c) => c.impact));
    return {
      teamId: t.teamId,
      changes,
      affected: summary.affected,
      notify: summary.notify,
      unreviewedJointEdits: t.jointEditsUnreviewed,
      beforeOpeningDays: days.filter((d) => startsBeforeOpening(entryOf(t, d), openingsFor(d, ref.openingTimes, ws.locationIds))).length,
      incompleteDays: days.filter((d) => {
        const e = entryOf(t, d);
        return !isEmpty(e) && !isComplete(e);
      }).length,
    };
  });
  return {
    teams,
    // Parked teams that were edited jointly and never reviewed on their own.
    parked: parkedTeams(ws)
      .filter((t) => t.jointEditsUnreviewed > 0)
      .map((t) => t.teamId),
    names: new Map(volunteers.map((v) => [v.id, v.name])),
  };
}
