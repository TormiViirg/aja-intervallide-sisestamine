/**
 * The legend rules from the design, as pure functions:
 *
 *  - Avaldamisjärgne aja ülekirjutus  → day differs from the published version
 *  - Enne avamisaega märgitud aeg     → window starts before a selected cinema opens
 *  - Kestab südaööst kauem            → window runs past midnight
 *  - 24h / 72h / vanemad muudatused   → background by age of the day's last change
 */
import type { LocationId } from './brand';
import { crossesMidnight, type DayEntry, isEmpty, sameEntry } from './interval';
import { type DateKey, HOUR_MS, utcMs, type UtcIso } from './time';

export interface OpeningTime {
  readonly locationId: LocationId;
  readonly date: DateKey;
  readonly opensAt: UtcIso;
}

export const RECENCY = ['none', 'day', 'threeDays', 'older'] as const;
export type Recency = (typeof RECENCY)[number];

/**
 * Equivalence classes of change age (now − changedAt):
 *   never changed → none · [0 h, 24 h) → day · [24 h, 72 h) → threeDays · ≥ 72 h → older.
 * A changedAt in the future (clock skew) is treated as "just now".
 */
export function recencyOf(changedAt: UtcIso | undefined, nowMs: number): Recency {
  if (!changedAt) return 'none';
  const age = Math.max(0, nowMs - utcMs(changedAt));
  if (age < 24 * HOUR_MS) return 'day';
  if (age < 72 * HOUR_MS) return 'threeDays';
  return 'older';
}

/** Opening times for one day, limited to the locations currently selected in "Asukohad". */
export function openingsFor(
  date: DateKey,
  openings: readonly OpeningTime[],
  locationIds: readonly LocationId[],
): OpeningTime[] {
  const wanted = new Set(locationIds);
  return openings.filter((o) => o.date === date && wanted.has(o.locationId));
}

/** True when the start is earlier than the opening of at least one selected location. */
export function startsBeforeOpening(entry: DayEntry, dayOpenings: readonly OpeningTime[]): boolean {
  if (!entry.start) return false;
  const start = utcMs(entry.start);
  return dayOpenings.some((o) => start < utcMs(o.opensAt));
}

export function overwrittenAfterPublish(entry: DayEntry, published: DayEntry | undefined): boolean {
  if (published === undefined) return false;
  if (isEmpty(published) && isEmpty(entry)) return false;
  return !sameEntry(entry, published);
}

export interface DayLegend {
  recency: Recency;
  beforeOpening: boolean;
  overnight: boolean;
  republished: boolean;
}

export function legendFor(args: {
  date: DateKey;
  entry: DayEntry;
  published: DayEntry | undefined;
  changedAt: UtcIso | undefined;
  dayOpenings: readonly OpeningTime[];
  nowMs: number;
}): DayLegend {
  return {
    recency: recencyOf(args.changedAt, args.nowMs),
    beforeOpening: startsBeforeOpening(args.entry, args.dayOpenings),
    overnight: crossesMidnight(args.date, args.entry),
    republished: overwrittenAfterPublish(args.entry, args.published),
  };
}
