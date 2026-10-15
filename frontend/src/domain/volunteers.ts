/**
 * Volunteers and the live-feedback groups in the "Tiimi vabatahtlikud" panel.
 */
import type { FestivalId, LocationId, TeamId, VolunteerId } from './brand';
import { type DateKey, MINUTE_MS, utcMs, type UtcIso } from './time';

export interface Volunteer {
  readonly id: VolunteerId;
  readonly name: string;
  readonly festivalId: FestivalId;
  readonly teamIds: readonly TeamId[];
  readonly locationIds: readonly LocationId[];
}

/** A free-time interval a volunteer has already opened (submitted) for a day. */
export interface Submission {
  readonly volunteerId: VolunteerId;
  readonly date: DateKey;
  readonly start: UtcIso;
  readonly end: UtcIso;
}

export interface VolunteerFilter {
  readonly festivalId: FestivalId;
  readonly teamIds: readonly TeamId[];
  readonly locationIds: readonly LocationId[];
}

/**
 * Festival must match exactly; team and location each need a non-empty intersection.
 * An empty team or location selection therefore shows nobody (not everybody).
 */
export function filterVolunteers(volunteers: readonly Volunteer[], f: VolunteerFilter): Volunteer[] {
  const teams = new Set(f.teamIds);
  const locations = new Set(f.locationIds);
  return volunteers.filter(
    (v) =>
      v.festivalId === f.festivalId &&
      v.teamIds.some((t) => teams.has(t)) &&
      v.locationIds.some((l) => locations.has(l)),
  );
}

/**
 * Measure of a union of half-open intervals (sweep over sorted starts), so that
 * overlapping submissions are not double-counted.
 */
export function unionLengthMs(intervals: ReadonlyArray<readonly [number, number]>): number {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = Number.NEGATIVE_INFINITY;
  let curEnd = Number.NEGATIVE_INFINITY;
  for (const [a, b] of sorted) {
    if (a > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else {
      curEnd = Math.max(curEnd, b);
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

export interface FeedbackThresholds {
  /** Minimum free time a volunteer should mark over the period. */
  readonly minMinutes: number;
  /** Width of the "close to the limit" band just above the minimum. */
  readonly nearMarginMinutes: number;
  /** A single day holding at least this share of someone's time counts as unusual. */
  readonly unusualDayShare: number;
}

export const DEFAULT_THRESHOLDS: FeedbackThresholds = {
  minMinutes: 600,
  nearMarginMinutes: 120,
  unusualDayShare: 0.6,
};

export type FeedbackGroup = 'unfilled' | 'tooFew' | 'nearLimit' | 'unusual';
export const FEEDBACK_GROUPS: readonly FeedbackGroup[] = ['unfilled', 'tooFew', 'nearLimit', 'unusual'];

export interface VolunteerStats {
  readonly totalMinutes: number;
  readonly largestDayShare: number;
}

export function statsFor(submissions: readonly Submission[]): VolunteerStats {
  const byDay = new Map<DateKey, Array<[number, number]>>();
  for (const s of submissions) {
    const list = byDay.get(s.date) ?? [];
    list.push([utcMs(s.start), utcMs(s.end)]);
    byDay.set(s.date, list);
  }
  const perDay = [...byDay.values()].map((iv) => unionLengthMs(iv) / MINUTE_MS);
  const totalMinutes = perDay.reduce((a, b) => a + b, 0);
  return {
    totalMinutes,
    largestDayShare: totalMinutes > 0 ? Math.max(...perDay) / totalMinutes : 0,
  };
}

/**
 * Equivalence classes on total minutes m (min = minMinutes, M = nearMarginMinutes):
 *   m = 0                → unfilled
 *   0 < m < min          → tooFew
 *   min ≤ m < min + M    → nearLimit
 *   m ≥ min + M          → (none of the three)
 * "unusual" is independent: m > 0 and largestDayShare ≥ unusualDayShare, with at least 2 days
 * of the period available (a one-day period can't be unevenly distributed).
 */
export function groupsFor(stats: VolunteerStats, t: FeedbackThresholds, periodDays: number): FeedbackGroup[] {
  const g: FeedbackGroup[] = [];
  const m = stats.totalMinutes;
  if (m === 0) g.push('unfilled');
  else if (m < t.minMinutes) g.push('tooFew');
  else if (m < t.minMinutes + t.nearMarginMinutes) g.push('nearLimit');
  if (m > 0 && periodDays >= 2 && stats.largestDayShare >= t.unusualDayShare) g.push('unusual');
  return g;
}

export type GroupedVolunteers = Record<FeedbackGroup, Volunteer[]>;

export function groupVolunteers(
  volunteers: readonly Volunteer[],
  submissions: readonly Submission[],
  days: ReadonlySet<DateKey>,
  t: FeedbackThresholds = DEFAULT_THRESHOLDS,
): GroupedVolunteers {
  const out: GroupedVolunteers = { unfilled: [], tooFew: [], nearLimit: [], unusual: [] };
  const byVolunteer = new Map<VolunteerId, Submission[]>();
  for (const s of submissions) {
    if (!days.has(s.date)) continue;
    const list = byVolunteer.get(s.volunteerId) ?? [];
    list.push(s);
    byVolunteer.set(s.volunteerId, list);
  }
  for (const v of volunteers) {
    for (const g of groupsFor(statsFor(byVolunteer.get(v.id) ?? []), t, days.size)) out[g].push(v);
  }
  return out;
}

/** Collator-based ordering so Estonian (õ ä ö ü) and Cyrillic names sort correctly. */
export function sortByName(list: readonly Volunteer[], locale: string): Volunteer[] {
  const c = new Intl.Collator(locale, { sensitivity: 'base' });
  return [...list].sort((a, b) => c.compare(a.name, b.name));
}

/** Volunteers per day who have opened at least one interval (the small number on each card). */
export function submittersPerDay(submissions: readonly Submission[], volunteerIds: ReadonlySet<VolunteerId>): Map<DateKey, number> {
  const sets = new Map<DateKey, Set<VolunteerId>>();
  for (const s of submissions) {
    if (!volunteerIds.has(s.volunteerId)) continue;
    const set = sets.get(s.date) ?? new Set<VolunteerId>();
    set.add(s.volunteerId);
    sets.set(s.date, set);
  }
  return new Map([...sets].map(([d, s]) => [d, s.size]));
}
