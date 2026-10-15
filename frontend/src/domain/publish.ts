/**
 * Publishing choices behind "Valikuid kinnitama" and their client-side validation.
 * The backend re-validates everything; this keeps the UI honest before the round trip.
 */
import { type DateKey, MINUTE_MS, parseWallTime, utcMs, type UtcIso, wallToUtc, isDateKey } from './time';

export type PublishChoice =
  | { readonly kind: 'now' }
  | { readonly kind: 'scheduled'; readonly at: UtcIso }
  | { readonly kind: 'draft' };

export type ScheduleStatus =
  | { readonly kind: 'draft' }
  | { readonly kind: 'scheduled'; readonly at: UtcIso }
  | { readonly kind: 'published'; readonly at: UtcIso };

/** Scheduling needs at least this much lead time so the request can't arrive "in the past". */
export const MIN_SCHEDULE_LEAD_MS = 5 * MINUTE_MS;

export type ScheduleProblem = 'invalidDate' | 'invalidTime' | 'tooSoon' | 'afterCollectionEnds';

export type ScheduleParse =
  | { readonly ok: true; readonly at: UtcIso }
  | { readonly ok: false; readonly problems: readonly ScheduleProblem[] };

/**
 * Validate an Estonian-time publish moment typed by the admin.
 * Valid iff  now + 5 min ≤ at < collectionEnd  (both boundaries in UTC).
 */
export function parseScheduledPublish(
  dateInput: string,
  timeInput: string,
  nowMs: number,
  collectionEndUtc: UtcIso,
): ScheduleParse {
  const problems: ScheduleProblem[] = [];
  const dateOk = isDateKey(dateInput);
  const minutes = parseWallTime(timeInput);
  if (!dateOk) problems.push('invalidDate');
  if (minutes === null) problems.push('invalidTime');
  if (!dateOk || minutes === null) return { ok: false, problems };
  const at = wallToUtc(dateInput as DateKey, minutes);
  if (utcMs(at) < nowMs + MIN_SCHEDULE_LEAD_MS) problems.push('tooSoon');
  if (utcMs(at) >= utcMs(collectionEndUtc)) problems.push('afterCollectionEnds');
  return problems.length ? { ok: false, problems } : { ok: true, at };
}

export function statusAfter(choice: PublishChoice, previous: ScheduleStatus, nowIso: UtcIso): ScheduleStatus {
  switch (choice.kind) {
    case 'now':
      return { kind: 'published', at: nowIso };
    case 'scheduled':
      return { kind: 'scheduled', at: choice.at };
    case 'draft':
      return previous;
  }
}
