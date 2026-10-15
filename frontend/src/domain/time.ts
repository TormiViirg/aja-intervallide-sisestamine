/**
 * Time model.
 *
 * The UI shows and accepts Estonian wall-clock time (Europe/Tallinn) regardless of the
 * viewer's own timezone — there is deliberately no conversion to the browser's zone.
 * Everything stored or compared is a UTC instant (`UtcIso`). Calendar days are
 * Tallinn calendar days (`DateKey`, "YYYY-MM-DD").
 */
import type { Brand } from './brand';

export const ESTONIAN_TIME_ZONE = 'Europe/Tallinn';

export type DateKey = Brand<string, 'DateKey'>;
export type UtcIso = Brand<string, 'UtcIso'>;
/** Minutes after local midnight, 0…1439. */
export type WallTime = Brand<number, 'WallTime'>;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): value is DateKey {
  const m = DATE_KEY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function toDateKey(value: string): DateKey {
  if (!isDateKey(value)) throw new RangeError(`Not a calendar date: ${value}`);
  return value;
}

export function toUtcIso(ms: number): UtcIso {
  return new Date(ms).toISOString() as UtcIso;
}

export function parseUtc(value: string): UtcIso {
  const ms = Date.parse(value);
  if (Number.isNaN(ms) || !/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    throw new RangeError(`Not an absolute UTC timestamp: ${value}`);
  }
  return toUtcIso(ms);
}

export const utcMs = (iso: UtcIso): number => Date.parse(iso);

function parts(key: DateKey): [number, number, number] {
  const m = DATE_KEY_RE.exec(key);
  if (!m) throw new RangeError(`Bad DateKey ${key}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = parts(key);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}` as DateKey;
}

/** Monday = 0 … Sunday = 6 (Estonian/ISO week). */
export function weekdayIndex(key: DateKey): number {
  const [y, m, d] = parts(key);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function mondayOf(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key));
}

export function daysBetween(from: DateKey, to: DateKey): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

/** Inclusive list of days. Empty when `to` is before `from`. */
export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const n = daysBetween(from, to);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(from, i));
}

// ---------------------------------------------------------------------------
// Tallinn wall clock <-> UTC
// ---------------------------------------------------------------------------

const tallinnFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ESTONIAN_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallPartsAt(ms: number): WallParts {
  const out: Record<string, number> = {};
  for (const p of tallinnFormatter.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/** Offset of Tallinn from UTC at a given instant, in minutes (+120 in winter, +180 in summer). */
export function tallinnOffsetMinutes(ms: number): number {
  const p = wallPartsAt(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE_MS);
}

/**
 * Tallinn wall time on a Tallinn date → UTC instant.
 * Ambiguous times (the repeated hour when DST ends) resolve to the earlier instant.
 * Non-existent times (the skipped hour when DST starts) resolve forward by the gap.
 */
export function wallToUtcMs(date: DateKey, minutes: number): number {
  const [y, m, d] = parts(date);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const earlier = naive - tallinnOffsetMinutes(naive - 3 * HOUR_MS) * MINUTE_MS;
  const later = naive - tallinnOffsetMinutes(naive + 3 * HOUR_MS) * MINUTE_MS;
  for (const candidate of [Math.min(earlier, later), Math.max(earlier, later)]) {
    const p = wallPartsAt(candidate);
    if (p.year === y && p.month === m && p.day === d && p.hour * 60 + p.minute === minutes) {
      return candidate;
    }
  }
  return Math.max(earlier, later);
}

export function wallToUtc(date: DateKey, minutes: number): UtcIso {
  return toUtcIso(wallToUtcMs(date, minutes));
}

export function utcToWall(iso: UtcIso | number): { date: DateKey; minutes: WallTime } {
  const ms = typeof iso === 'number' ? iso : utcMs(iso);
  const p = wallPartsAt(ms);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}` as DateKey,
    minutes: (p.hour * 60 + p.minute) as WallTime,
  };
}

export function tallinnDateOf(ms: number): DateKey {
  return utcToWall(ms).date;
}

/** Half-open UTC bounds [start, end) of a Tallinn calendar day (23 h or 25 h on DST days). */
export function tallinnDayBoundsMs(date: DateKey): [number, number] {
  return [wallToUtcMs(date, 0), wallToUtcMs(addDays(date, 1), 0)];
}

// ---------------------------------------------------------------------------
// Wall time parsing / formatting
// ---------------------------------------------------------------------------

const WALL_RE = /^\s*(\d{1,2})\s*[:.]?\s*(\d{2})\s*$/;

/** Accepts "8:30", "08:30", "08.30" and "0830". Returns null for anything outside 00:00–23:59. */
export function parseWallTime(input: string): WallTime | null {
  const m = WALL_RE.exec(input);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return (h * 60 + min) as WallTime;
}

export function formatWallTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function formatDayMonth(key: DateKey): string {
  const [, m, d] = parts(key);
  return `${pad(d)}.${pad(m)}`;
}

export function formatFullDate(key: DateKey): string {
  const [y, m, d] = parts(key);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** "23:59 24.10.2026" in Tallinn time — the status line format in the design. */
export function formatStamp(iso: UtcIso): string {
  const { date, minutes } = utcToWall(iso);
  return `${formatWallTime(minutes)} ${formatFullDate(date)}`;
}

/** Calendar date objects for UI widgets: local-midnight Date for a DateKey and back. */
export function dateKeyToLocalDate(key: DateKey): Date {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d);
}

export function localDateToDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as DateKey;
}
