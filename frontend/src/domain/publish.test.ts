/**
 * Scheduled publishing (Estonian time) — equivalence partitions / boundary values
 * now = 15.10.2026 12:00 Tallinn (09:00Z), collection ends 25.11.2026 00:00 Tallinn.
 * ┌──────────────────────────────────┬─────────┬────────────────────────┐
 * │ class                            │ valid   │ boundary               │
 * ├──────────────────────────────────┼─────────┼────────────────────────┤
 * │ now + 4 min                      │ no      │ lead − 1 min           │
 * │ now + 5 min                      │ yes     │ lead exactly           │
 * │ well inside                      │ yes     │ 24.10 23:59            │
 * │ collection end − 1 min           │ yes     │ 24.11 23:59            │
 * │ collection end                   │ no      │ 25.11 00:00            │
 * │ bad date / bad time / both       │ no      │ 2026-02-30, 24:00      │
 * └──────────────────────────────────┴─────────┴────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import { parseScheduledPublish, statusAfter } from './publish';
import { toDateKey, toUtcIso, wallToUtc } from './time';

const NOW = Date.parse('2026-10-15T09:00:00Z');
const END = wallToUtc(toDateKey('2026-11-25'), 0);

describe('parseScheduledPublish', () => {
  it.each([
    ['2026-10-15', '12:04', ['tooSoon']],
    ['2026-10-15', '12:05', []],
    ['2026-10-24', '23:59', []],
    ['2026-11-24', '23:59', []],
    ['2026-11-25', '00:00', ['afterCollectionEnds']],
    ['2026-02-30', '10:00', ['invalidDate']],
    ['2026-10-20', '24:00', ['invalidTime']],
    ['', '', ['invalidDate', 'invalidTime']],
  ])('%s %s → %j', (date, time, problems) => {
    const r = parseScheduledPublish(date, time, NOW, END);
    expect(r.ok ? [] : r.problems).toEqual(problems);
  });

  it('returns the UTC instant for a valid Estonian time', () => {
    const r = parseScheduledPublish('2026-10-24', '23:59', NOW, END);
    expect(r).toEqual({ ok: true, at: '2026-10-24T20:59:00.000Z' });
  });
});

describe('statusAfter', () => {
  const now = toUtcIso(NOW);
  const prev = { kind: 'draft' } as const;
  it('publishes now', () => expect(statusAfter({ kind: 'now' }, prev, now)).toEqual({ kind: 'published', at: now }));
  it('keeps the previous status when only saving', () => expect(statusAfter({ kind: 'draft' }, prev, now)).toBe(prev));
});
