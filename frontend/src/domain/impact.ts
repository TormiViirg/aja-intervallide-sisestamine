/**
 * Who is affected by editing an already published day.
 *
 * Volunteers could only open intervals inside the published window W₀. After the edit the
 * window is W₁. A volunteer is
 *   - affected  when they have any opened interval on a changed day, and
 *   - notified  when one of those intervals intersects W₀ \ W₁ (time that was taken away).
 * Intervals are half-open [start, end): merely touching an endpoint is not an intersection.
 */
import type { VolunteerId } from './brand';
import { type DayEntry, sameEntry, windowMs } from './interval';
import type { DateKey } from './time';
import { utcMs } from './time';
import type { Submission } from './volunteers';

export type Span = readonly [number, number];

export const intersects = (a: Span, b: Span): boolean => a[0] < b[1] && b[0] < a[1];

/** a \ b as up to two half-open spans. */
export function subtract(a: Span, b: Span | null): Span[] {
  if (!b || !intersects(a, b)) return [a];
  const out: Span[] = [];
  if (a[0] < b[0]) out.push([a[0], b[0]]);
  if (b[1] < a[1]) out.push([b[1], a[1]]);
  return out;
}

export interface DayImpact {
  readonly date: DateKey;
  readonly affected: readonly VolunteerId[];
  readonly notify: readonly VolunteerId[];
}

export function dayImpact(
  date: DateKey,
  published: DayEntry | undefined,
  draft: DayEntry,
  submissions: readonly Submission[],
): DayImpact {
  if (!published || sameEntry(published, draft)) return { date, affected: [], notify: [] };
  const daySubs = submissions.filter((s) => s.date === date);
  const w0 = windowMs(published);
  const removed = w0 ? subtract(w0, windowMs(draft)) : [];
  const affected = new Set<VolunteerId>();
  const notify = new Set<VolunteerId>();
  for (const s of daySubs) {
    affected.add(s.volunteerId);
    const span: Span = [utcMs(s.start), utcMs(s.end)];
    if (removed.some((r) => intersects(r, span))) notify.add(s.volunteerId);
  }
  return { date, affected: [...affected], notify: [...notify] };
}

export interface ImpactSummary {
  readonly days: readonly DayImpact[];
  readonly affected: readonly VolunteerId[];
  readonly notify: readonly VolunteerId[];
}

export function summarizeImpact(days: readonly DayImpact[]): ImpactSummary {
  const affected = new Set<VolunteerId>();
  const notify = new Set<VolunteerId>();
  for (const d of days) {
    d.affected.forEach((v) => affected.add(v));
    d.notify.forEach((v) => notify.add(v));
  }
  return { days: days.filter((d) => d.affected.length > 0), affected: [...affected], notify: [...notify] };
}
