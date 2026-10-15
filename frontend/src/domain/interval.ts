/**
 * One day's volunteer collection window ("intervalli valiku komponent").
 * Stored as UTC instants; displayed as Tallinn wall time.
 *
 * Rule for the end: an end wall time that is not after the start wall time belongs to the
 * next day (e.g. 10:30 → 01:59 means 01:59 the following night). So a window is always
 * 1 min … 24 h long; equal start and end is flagged as invalid instead of silently becoming 24 h.
 */
import {
  addDays,
  type DateKey,
  utcMs,
  utcToWall,
  type UtcIso,
  type WallTime,
  wallToUtc,
  MINUTE_MS,
} from './time';

export interface DayEntry {
  readonly start: UtcIso | null;
  readonly end: UtcIso | null;
}

export type Field = 'start' | 'end';
export const FIELDS: readonly Field[] = ['start', 'end'];

export const EMPTY_ENTRY: DayEntry = Object.freeze({ start: null, end: null });

export interface EntryWall {
  start: WallTime | null;
  end: WallTime | null;
  /** 1 when the end falls on the following calendar day. */
  endDayOffset: 0 | 1;
}

export function entryWall(date: DateKey, entry: DayEntry): EntryWall {
  const start = entry.start ? utcToWall(entry.start).minutes : null;
  if (!entry.end) return { start, end: null, endDayOffset: 0 };
  const endWall = utcToWall(entry.end);
  return { start, end: endWall.minutes, endDayOffset: endWall.date === date ? 0 : 1 };
}

function resolveEnd(date: DateKey, start: WallTime | null, end: WallTime): UtcIso {
  const nextDay = start !== null && end <= start;
  return wallToUtc(nextDay ? addDays(date, 1) : date, end);
}

export function setField(
  date: DateKey,
  entry: DayEntry,
  field: Field,
  minutes: WallTime | null,
): DayEntry {
  const wall = entryWall(date, entry);
  const start = field === 'start' ? minutes : wall.start;
  const end = field === 'end' ? minutes : wall.end;
  return {
    start: start === null ? null : wallToUtc(date, start),
    end: end === null ? null : resolveEnd(date, start, end),
  };
}

export function fieldWall(date: DateKey, entry: DayEntry, field: Field): WallTime | null {
  return entryWall(date, entry)[field];
}

export const isComplete = (e: DayEntry): e is { start: UtcIso; end: UtcIso } =>
  e.start !== null && e.end !== null;

export const isEmpty = (e: DayEntry): boolean => e.start === null && e.end === null;

export function sameEntry(a: DayEntry, b: DayEntry): boolean {
  return a.start === b.start && a.end === b.end;
}

/** Real elapsed minutes (DST-aware), or null for incomplete windows. */
export function durationMinutes(entry: DayEntry): number | null {
  if (!isComplete(entry)) return null;
  return Math.round((utcMs(entry.end) - utcMs(entry.start)) / MINUTE_MS);
}

/** Legend rule "Kestab südaööst kauem": the window ends on a later calendar day than it starts. */
export function crossesMidnight(date: DateKey, entry: DayEntry): boolean {
  const w = entryWall(date, entry);
  // Ending exactly at 00:00 the next day does not *outlast* midnight.
  return w.end !== null && w.endDayOffset === 1 && w.end !== 0;
}

export type EntryProblem = 'sameStartEnd';

export function entryProblems(date: DateKey, entry: DayEntry): EntryProblem[] {
  const w = entryWall(date, entry);
  return w.start !== null && w.end !== null && w.start === w.end ? ['sameStartEnd'] : [];
}

/** Half-open UTC window in ms, or null. */
export function windowMs(entry: DayEntry): [number, number] | null {
  return isComplete(entry) ? [utcMs(entry.start), utcMs(entry.end)] : null;
}
