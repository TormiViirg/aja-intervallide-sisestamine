import type { ClockPort } from '../../application/ports';

export const systemClock: ClockPort = { now: () => Date.now() };

export const fixedClock = (ms: number): ClockPort => ({ now: () => ms });

/** `?now=2026-10-15T09:00:00Z` pins the clock — used by visual comparison and e2e tests. */
export function clockFromLocation(search: string): ClockPort {
  const raw = new URLSearchParams(search).get('now');
  const ms = raw ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(ms) ? systemClock : fixedClock(ms);
}
