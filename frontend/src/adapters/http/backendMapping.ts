/**
 * Pure translation between the backend's JSON (see backend/src/ports/repository.js) and the
 * frontend domain. The backend speaks Estonian wall-clock "HH:MM" per ISO date and uses
 * location *names* as identifiers; the frontend stores UTC instants.
 */
import type { LocationId, TeamId, VolunteerId } from '../../domain/brand';
import { type DayEntry, EMPTY_ENTRY, entryWall, isEmpty, setField } from '../../domain/interval';
import type { OpeningTime } from '../../domain/legend';
import type { EligibilityWindow } from '../../domain/schedule';
import {
  addDays,
  type DateKey,
  eachDay,
  formatWallTime,
  isDateKey,
  parseWallTime,
  utcToWall,
  type UtcIso,
  wallToUtc,
} from '../../domain/time';
import type { FestivalId } from '../../domain/brand';
import type { Submission, Volunteer } from '../../domain/volunteers';
import type { EntryMap } from '../../domain/workspace';

// ---- DTOs (shape of the backend responses) -------------------------------------

export interface ConfigDto {
  allowedRange: { from: string; to: string };
  openingTimes: { open: string; close: string; cinema: string };
  /** Present with the Supabase repository: one row per date and location. */
  openingHours?: Array<{ date: string; open: string | null; close: string | null; location: string }>;
  timeZone?: string;
  browserTz?: string | null;
  displayTz?: string;
}

export interface TeamDto {
  id: string;
  name: string;
}

export interface VolunteerDto {
  id: number | string;
  name: string;
  festival: string;
  team: string;
  /** One name, or several joined with ", " (Supabase repository). */
  location: string;
  opened: Array<{ date: string; start?: string | null; end?: string | null }>;
}

export type ValuesDto = Record<string, { start?: string | null; end?: string | null }>;

export interface PublishResponseDto {
  ok: true;
  status: 'published' | 'scheduled' | 'draft';
  publishAt?: string;
  affected?: string[];
  toNotify?: string[];
}

export interface PreviewResponseDto {
  affected: string[];
  toNotify: string[];
  affectedCount: number;
  toNotifyCount: number;
}

// ---- Config ------------------------------------------------------------------

/** The backend's allowed range is inclusive calendar dates; the frontend wants a half-open UTC window. */
export function eligibilityFromRange(range: ConfigDto['allowedRange']): EligibilityWindow {
  const from = toDate(range.from);
  const to = toDate(range.to);
  return { fromUtc: wallToUtc(from, 0), untilUtc: wallToUtc(addDays(to, 1), 0) };
}

export function locationsFromConfig(cfg: ConfigDto): string[] {
  const names = cfg.openingHours?.length ? cfg.openingHours.map((h) => h.location) : [cfg.openingTimes.cinema];
  return [...new Set(names.filter(Boolean))];
}

/**
 * Per-day opening times. With `openingHours` (Supabase) each row is used as is. The in-memory
 * repository only has one global opening time, which is applied to every day of the range.
 */
export function openingTimesFromConfig(cfg: ConfigDto): OpeningTime[] {
  const rows = cfg.openingHours?.length
    ? cfg.openingHours.map((h) => ({ date: h.date, open: h.open, location: h.location }))
    : eachDay(toDate(cfg.allowedRange.from), toDate(cfg.allowedRange.to)).map((date) => ({
        date: date as string,
        open: cfg.openingTimes.open,
        location: cfg.openingTimes.cinema,
      }));
  return rows.flatMap((r) => {
    const minutes = r.open ? parseWallTime(r.open) : null;
    if (!isDateKey(r.date) || minutes === null || !r.location) return [];
    return [{ locationId: r.location as LocationId, date: r.date, opensAt: wallToUtc(r.date, minutes) }];
  });
}

// ---- Schedules ---------------------------------------------------------------

/** Backend draft values → entries. Times that don't parse are dropped rather than guessed. */
export function entriesFromValues(values: ValuesDto): Record<DateKey, DayEntry> {
  const out: Record<DateKey, DayEntry> = {};
  for (const [date, v] of Object.entries(values ?? {})) {
    if (!isDateKey(date)) continue;
    const start = v?.start ? parseWallTime(v.start) : null;
    const end = v?.end ? parseWallTime(v.end) : null;
    const entry = setField(date, setField(date, EMPTY_ENTRY, 'start', start), 'end', end);
    if (!isEmpty(entry)) out[date] = entry;
  }
  return out;
}

/**
 * Entries → backend values, limited to the backend's allowed range (it rejects other dates).
 * Cleared days are sent as {} so the backend can supersede a previously stored value.
 */
export function valuesFromEntries(entries: EntryMap, allowed: ConfigDto['allowedRange'], previous: EntryMap = {}): ValuesDto {
  const out: ValuesDto = {};
  const dates = new Set([...Object.keys(entries), ...Object.keys(previous)]) as Set<DateKey>;
  for (const date of [...dates].sort()) {
    if (date < allowed.from || date > allowed.to) continue;
    const w = entryWall(date, entries[date] ?? EMPTY_ENTRY);
    out[date] =
      w.start === null && w.end === null
        ? {}
        : { start: w.start === null ? null : formatWallTime(w.start), end: w.end === null ? null : formatWallTime(w.end) };
  }
  return out;
}

/** UTC instant → the backend's scheduled-publish format: Estonian local "YYYY-MM-DDTHH:mm". */
export function tallinnLocalStamp(at: UtcIso): string {
  const { date, minutes } = utcToWall(at);
  return `${date}T${formatWallTime(minutes)}`;
}

// ---- Volunteers --------------------------------------------------------------

/**
 * Merges the per-team volunteer lists. The backend already filtered by festival, so every
 * volunteer is tagged with the festival the frontend asked for (the Supabase repository
 * reports its numeric festival id instead of the name).
 */
export function volunteersFromDtos(byTeam: ReadonlyArray<readonly [TeamId, VolunteerDto[]]>, festivalId: FestivalId): Volunteer[] {
  const merged = new Map<string, { id: VolunteerId; name: string; teams: Set<TeamId>; locations: Set<LocationId> }>();
  for (const [teamId, list] of byTeam) {
    for (const v of list) {
      const key = String(v.id);
      const cur = merged.get(key) ?? { id: key as VolunteerId, name: v.name, teams: new Set(), locations: new Set() };
      cur.teams.add(teamId);
      for (const l of v.location.split(', ').filter(Boolean)) cur.locations.add(l as LocationId);
      merged.set(key, cur);
    }
  }
  return [...merged.values()].map((v) => ({
    id: v.id,
    name: v.name,
    festivalId,
    teamIds: [...v.teams],
    locationIds: [...v.locations],
  }));
}

/** Opened intervals with both times become submissions; "day opened" rows without times are skipped. */
export function submissionsFromDtos(list: readonly VolunteerDto[]): Submission[] {
  const seen = new Set<string>();
  const out: Submission[] = [];
  for (const v of list) {
    for (const o of v.opened) {
      const start = o.start ? parseWallTime(o.start) : null;
      const end = o.end ? parseWallTime(o.end) : null;
      if (!isDateKey(o.date) || start === null || end === null) continue;
      const key = `${v.id}|${o.date}|${start}|${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = setField(o.date, setField(o.date, EMPTY_ENTRY, 'start', start), 'end', end);
      out.push({ volunteerId: String(v.id) as VolunteerId, date: o.date, start: entry.start as UtcIso, end: entry.end as UtcIso });
    }
  }
  return out;
}

function toDate(s: string): DateKey {
  if (!isDateKey(s)) throw new Error(`Backend sent an invalid date: ${s}`);
  return s;
}
