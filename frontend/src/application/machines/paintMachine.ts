/**
 * Touch-overwrite gesture ("Kirjutab üle puudutusel").
 *
 *   idle ──DOWN──▶ pressed ──ENTER(other day)──▶ painting ──UP──▶ idle
 *                    │  └──after HOLD_MS──▶ filledAll ──UP──▶ idle
 *                    └──UP──▶ idle  (a plain tap paints just that day)
 *
 * The machine knows nothing about values or locks: it emits `paint` / `fillAll`
 * and the app decides what that means. Each day is painted at most once per stroke.
 */
import { assign, emit, setup } from 'xstate';
import type { DateKey } from '../../domain/time';

export const HOLD_TO_FILL_MS = 700;

export type PaintEvent =
  | { type: 'DOWN'; date: DateKey }
  | { type: 'ENTER'; date: DateKey }
  | { type: 'UP' }
  | { type: 'CANCEL' };

export type PaintEmitted = { type: 'paint'; date: DateKey } | { type: 'fillAll' } | { type: 'strokeEnd' };

export const paintMachine = setup({
  types: {
    context: {} as { painted: readonly DateKey[] },
    events: {} as PaintEvent,
    emitted: {} as PaintEmitted,
  },
  delays: { HOLD: HOLD_TO_FILL_MS },
  guards: {
    isNewDay: ({ context, event }: { context: { painted: readonly DateKey[] }; event: PaintEvent }) =>
      'date' in event && !context.painted.includes(event.date),
  },
  actions: {
    paintDay: assign({ painted: ({ context, event }) => ('date' in event ? [...context.painted, event.date] : context.painted) }),
    emitPaint: emit(({ event }) => ({ type: 'paint' as const, date: (event as { date: DateKey }).date })),
    emitFillAll: emit({ type: 'fillAll' as const }),
    resetPainted: assign({ painted: [] }),
    emitStrokeEnd: emit({ type: 'strokeEnd' as const }),
  },
}).createMachine({
  id: 'paint',
  context: { painted: [] },
  initial: 'idle',
  states: {
    idle: {
      on: { DOWN: { target: 'pressed', actions: ['paintDay', 'emitPaint'] } },
    },
    pressed: {
      after: { HOLD: { target: 'filledAll', actions: 'emitFillAll' } },
      on: {
        ENTER: { guard: 'isNewDay', target: 'painting', actions: ['paintDay', 'emitPaint'] },
        UP: { target: 'idle', actions: ['resetPainted', 'emitStrokeEnd'] },
        CANCEL: { target: 'idle', actions: ['resetPainted', 'emitStrokeEnd'] },
      },
    },
    painting: {
      on: {
        ENTER: { guard: 'isNewDay', actions: ['paintDay', 'emitPaint'] },
        UP: { target: 'idle', actions: ['resetPainted', 'emitStrokeEnd'] },
        CANCEL: { target: 'idle', actions: ['resetPainted', 'emitStrokeEnd'] },
      },
    },
    filledAll: {
      on: {
        UP: { target: 'idle', actions: ['resetPainted', 'emitStrokeEnd'] },
        CANCEL: { target: 'idle', actions: ['resetPainted', 'emitStrokeEnd'] },
      },
    },
  },
});
