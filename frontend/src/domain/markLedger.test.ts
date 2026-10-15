/**
 * OKLCH maximin + mass-overwrite colour ledger (finite state machine)
 * ┌──────────────────────────┬─────────────────────────────────────────────────────────────┐
 * │ aspect                   │ cases                                                       │
 * ├──────────────────────────┼─────────────────────────────────────────────────────────────┤
 * │ pickMaxContrastGray      │ nothing occupied → darkest allowed; tie → darker            │
 * │                          │ legend greys + ink + paper → ≈ midpoint of ink and 0.676    │
 * │                          │ result always within [min, max]; min > max throws           │
 * │ transitions              │ idle─OPEN→open, open─CLOSE→idle, MARK in idle ignored       │
 * │                          │ OPEN while open ignored (one batch per use)                 │
 * │ colours                  │ every batch ≥ 0.05 ΔL from all day colours, ≥ 0.08 apart │
 * │ garbage collection       │ CLOSE drops batches with no marks; freed grey is reused     │
 * │ UNMARK                   │ last mark removes the day entry                             │
 * └──────────────────────────┴─────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import { batchesInUse, colorsOnDay, initialLedger, ledgerReducer, type LedgerState } from './markLedger';
import { MIDNIGHT_HALO_LIGHTNESS, minSeparation, pickMaxContrastGray, RECENCY_LIGHTNESS } from './oklch';
import { toDateKey, type WallTime } from './time';

const legendGreys = [...Object.values(RECENCY_LIGHTNESS), MIDNIGHT_HALO_LIGHTNESS];
const values = { start: null, end: 1305 as WallTime };
const D1 = toDateKey('2026-10-28');
const D2 = toDateKey('2026-11-12');

describe('pickMaxContrastGray', () => {
  it('returns the darkest allowed grey when nothing is occupied', () => {
    expect(pickMaxContrastGray([], { min: 0.2, max: 0.8 })).toBe(0.2);
  });

  it('prefers the darker candidate on a tie', () => {
    expect(pickMaxContrastGray([0.5], { min: 0.3, max: 0.7 })).toBe(0.3);
  });

  it('lands between ink and the darkest legend grey', () => {
    const l = pickMaxContrastGray([0, 1, ...legendGreys]);
    expect(l).toBeCloseTo(0.338, 2);
  });

  it('stays inside its bounds', () => {
    const l = pickMaxContrastGray([0.15, 0.85], { min: 0.15, max: 0.85 });
    expect(l).toBeGreaterThanOrEqual(0.15);
    expect(l).toBeLessThanOrEqual(0.85);
  });

  it('throws for an empty search interval', () => {
    expect(() => pickMaxContrastGray([], { min: 0.9, max: 0.1 })).toThrow(RangeError);
  });
});

function run(state: LedgerState, ...events: Parameters<typeof ledgerReducer>[1][]): LedgerState {
  return events.reduce(ledgerReducer, state);
}

describe('ledgerReducer', () => {
  it('ignores MARK while idle', () => {
    expect(run(initialLedger, { type: 'MARK', date: D1, fields: ['end'] })).toBe(initialLedger);
  });

  it('opens one batch per use and ignores a second OPEN', () => {
    const s = run(initialLedger, { type: 'OPEN', values, surroundings: legendGreys }, { type: 'OPEN', values, surroundings: [] });
    expect(s.phase).toBe('open');
    expect(Object.keys(s.batches)).toHaveLength(1);
  });

  it('records start and end marks separately', () => {
    const s = run(
      initialLedger,
      { type: 'OPEN', values, surroundings: legendGreys },
      { type: 'MARK', date: D1, fields: ['end'] },
    );
    expect(s.marks[D1]).toEqual({ end: 1 });
    expect(colorsOnDay(s, D1)).toHaveLength(1);
  });

  it('gives consecutive batches clearly different greys', () => {
    let s: LedgerState = initialLedger;
    for (let i = 0; i < 4; i++) {
      s = run(
        s,
        { type: 'OPEN', values, surroundings: legendGreys },
        { type: 'MARK', date: toDateKey(`2026-11-0${i + 2}`), fields: ['start', 'end'] },
        { type: 'CLOSE' },
      );
    }
    const greys = batchesInUse(s).map((b) => b.lightness);
    expect(greys).toHaveLength(4);
    for (const [i, g] of greys.entries()) {
      const others = [0, 1, ...legendGreys, ...greys.filter((_, j) => j !== i)];
      expect(Math.min(...others.map((o) => Math.abs(o - g)))).toBeGreaterThanOrEqual(0.05);
    }
    // Four live batches squeezed between ink and the legend greys: ≈0.085 ΔL is the geometric optimum.
    expect(minSeparation(greys)).toBeGreaterThanOrEqual(0.08);
  });

  it('drops an unused batch on CLOSE and reuses its grey', () => {
    const a = run(initialLedger, { type: 'OPEN', values, surroundings: legendGreys }, { type: 'CLOSE' });
    expect(batchesInUse(a)).toEqual([]);
    const b = run(a, { type: 'OPEN', values, surroundings: legendGreys });
    const first = run(initialLedger, { type: 'OPEN', values, surroundings: legendGreys });
    expect(batchesInUse(b)[0]?.lightness).toBe(batchesInUse(first)[0]?.lightness);
  });

  it('removes the day entry when its last mark is undone', () => {
    const s = run(
      initialLedger,
      { type: 'OPEN', values, surroundings: [] },
      { type: 'MARK', date: D2, fields: ['end'] },
      { type: 'UNMARK', date: D2, field: 'end' },
    );
    expect(s.marks[D2]).toBeUndefined();
  });

  it('RESET clears marks but keeps ids monotonic', () => {
    const s = run(initialLedger, { type: 'OPEN', values, surroundings: [] }, { type: 'RESET' });
    expect(s).toMatchObject({ phase: 'idle', marks: {}, nextId: 2 });
  });
});
