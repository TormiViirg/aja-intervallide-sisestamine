/**
 * Mass-overwrite colour ledger — a finite state machine (Mealy-style reducer).
 *
 * Every use of "Mass üle kirjutamine kellaaeg" with one set of values is a *batch*.
 * A batch gets one grey, picked to contrast as much as possible with every colour
 * already present on the days (card backgrounds, halos, earlier batches, ink, paper).
 * Each day remembers which batch last wrote its start and/or end; the card draws
 * those as the rectangle(s) on its left edge (top half = start, bottom half = end).
 *
 *   states:  idle ──OPEN──▶ open ──CLOSE──▶ idle
 *                            │  ▲
 *                     MARK / UNMARK (self-loops)
 *   UNMARK and RESET are accepted in both states.
 */
import type { Field } from './interval';
import { INK, PAPER, pickMaxContrastGray } from './oklch';
import type { DateKey, WallTime } from './time';

export interface BatchValues {
  start: WallTime | null;
  end: WallTime | null;
}

export interface Batch {
  readonly id: number;
  readonly lightness: number;
  readonly values: BatchValues;
}

export type DayMarks = Partial<Record<Field, number>>;

export type LedgerState =
  | { readonly phase: 'idle'; readonly batches: Readonly<Record<number, Batch>>; readonly marks: Readonly<Record<DateKey, DayMarks>>; readonly nextId: number }
  | { readonly phase: 'open'; readonly active: number; readonly batches: Readonly<Record<number, Batch>>; readonly marks: Readonly<Record<DateKey, DayMarks>>; readonly nextId: number };

export type LedgerEvent =
  /** Start a batch. `surroundings` = lightness of every non-batch colour on the visible days. */
  | { type: 'OPEN'; values: BatchValues; surroundings: readonly number[] }
  | { type: 'MARK'; date: DateKey; fields: readonly Field[] }
  | { type: 'UNMARK'; date: DateKey; field: Field }
  | { type: 'CLOSE' }
  | { type: 'RESET' };

export const initialLedger: LedgerState = { phase: 'idle', batches: {}, marks: {}, nextId: 1 };

/** Batches still referenced by a mark (plus the active one). Unreferenced colours are free again. */
export function batchesInUse(state: LedgerState): Batch[] {
  const used = new Set<number>();
  for (const m of Object.values(state.marks)) {
    if (m.start !== undefined) used.add(m.start);
    if (m.end !== undefined) used.add(m.end);
  }
  if (state.phase === 'open') used.add(state.active);
  return [...used].sort((a, b) => a - b).flatMap((id) => (state.batches[id] ? [state.batches[id]] : []));
}

/** Every batch colour that has touched a given day. */
export function colorsOnDay(state: LedgerState, date: DateKey): number[] {
  const m = state.marks[date];
  if (!m) return [];
  const ids = new Set([m.start, m.end].filter((x): x is number => x !== undefined));
  return [...ids].flatMap((id) => (state.batches[id] ? [state.batches[id].lightness] : []));
}

/** The grey the next batch would get — shown on the mass panel's edge before it is used. */
export function previewNextLightness(state: LedgerState, surroundings: readonly number[]): number {
  if (state.phase === 'open') return state.batches[state.active]?.lightness ?? INK;
  return pickMaxContrastGray([INK, PAPER, ...surroundings, ...batchesInUse(state).map((b) => b.lightness)]);
}

function prune(batches: Readonly<Record<number, Batch>>, keep: Set<number>): Record<number, Batch> {
  return Object.fromEntries(Object.entries(batches).filter(([id]) => keep.has(Number(id))));
}

export function ledgerReducer(state: LedgerState, event: LedgerEvent): LedgerState {
  switch (event.type) {
    case 'OPEN': {
      if (state.phase === 'open') return state; // already collecting a batch
      const lightness = previewNextLightness(state, event.surroundings);
      const id = state.nextId;
      return {
        phase: 'open',
        active: id,
        nextId: id + 1,
        marks: state.marks,
        batches: { ...state.batches, [id]: { id, lightness, values: event.values } },
      };
    }
    case 'MARK': {
      if (state.phase !== 'open' || event.fields.length === 0) return state;
      const prev = state.marks[event.date] ?? {};
      const next: DayMarks = { ...prev };
      for (const f of event.fields) next[f] = state.active;
      return { ...state, marks: { ...state.marks, [event.date]: next } };
    }
    case 'UNMARK': {
      const prev = state.marks[event.date];
      if (!prev || prev[event.field] === undefined) return state;
      const { [event.field]: _removed, ...rest } = prev;
      const marks = { ...state.marks };
      if (Object.keys(rest).length) marks[event.date] = rest;
      else delete marks[event.date];
      return { ...state, marks };
    }
    case 'CLOSE': {
      if (state.phase === 'idle') return state;
      const closed: LedgerState = { phase: 'idle', marks: state.marks, nextId: state.nextId, batches: state.batches };
      const keep = new Set(batchesInUse(closed).map((b) => b.id));
      return { ...closed, batches: prune(state.batches, keep) };
    }
    case 'RESET':
      return { ...initialLedger, nextId: state.nextId };
    default: {
      const never: never = event;
      return never;
    }
  }
}
