import { fixedClock } from '../adapters/browser/clocks';
import { type CookieJar, createCookieTimezone } from '../adapters/browser/cookieTimezone';
import { createMockReference, createMockSchedules, createMockVolunteers } from '../adapters/mock/mockAdapters';
import type { Ports } from '../application/ports';

/** 15.10.2026 12:00 Tallinn — the same instant the visual comparison uses. */
export const TEST_NOW = Date.parse('2026-10-15T09:00:00Z');

export function memoryJar(initial = ''): CookieJar & { all: () => string } {
  const store = new Map<string, string>();
  for (const part of initial.split(';').filter(Boolean)) {
    const [k, v] = part.trim().split('=');
    if (k) store.set(k, v ?? '');
  }
  return {
    get: () => [...store].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (cookie) => {
      const [pair] = cookie.split(';');
      const [k, v] = (pair ?? '').split('=');
      if (k) store.set(k.trim(), v ?? '');
    },
    all: () => [...store].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

export function testPorts(opts: { zone?: string; jar?: CookieJar; now?: number } = {}) {
  const clock = fixedClock(opts.now ?? TEST_NOW);
  const schedules = createMockSchedules(clock, 0);
  const ports: Ports = {
    clock,
    reference: createMockReference(0),
    schedules,
    volunteers: createMockVolunteers(0),
    timezone: createCookieTimezone(opts.jar ?? memoryJar(), () => opts.zone ?? 'America/New_York'),
  };
  return { ports, schedules };
}
