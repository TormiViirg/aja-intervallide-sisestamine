/**
 * Two-calendar range picker for "Vabatahtlikelt korjatav vabade aegade vahemik".
 * Left calendar picks the start, right calendar picks the end.
 *
 *   closed ──OPEN──▶ open ──APPLY [complete ∧ ordered ∧ eligible]──▶ closed (emits `applied`)
 *                     │ PICK_START / PICK_END (self-loops, guarded by eligibility)
 *                     └──CANCEL──▶ closed
 */
import { and, assign, emit, setup } from 'xstate';
import { type DateRange, type EligibilityWindow, isDayEligible } from '../../domain/schedule';
import type { DateKey } from '../../domain/time';

export interface RangePickerContext {
  readonly eligibility: EligibilityWindow;
  readonly from: DateKey | null;
  readonly to: DateKey | null;
}

export type RangePickerEvent =
  | { type: 'OPEN'; range: DateRange }
  | { type: 'PICK_START'; date: DateKey }
  | { type: 'PICK_END'; date: DateKey }
  | { type: 'APPLY' }
  | { type: 'CANCEL' };

export const rangePickerMachine = setup({
  types: {
    context: {} as RangePickerContext,
    events: {} as RangePickerEvent,
    input: {} as { eligibility: EligibilityWindow },
    emitted: {} as { type: 'applied'; range: DateRange },
  },
  guards: {
    eligible: ({ context, event }) => 'date' in event && isDayEligible(event.date, context.eligibility),
    endNotBeforeStart: ({ context, event }) =>
      'date' in event && (context.from === null || event.date >= context.from),
    complete: ({ context }) => context.from !== null && context.to !== null && context.from <= context.to,
  },
}).createMachine({
  id: 'rangePicker',
  context: ({ input }) => ({ eligibility: input.eligibility, from: null, to: null }),
  initial: 'closed',
  states: {
    closed: {
      on: {
        OPEN: { target: 'open', actions: assign(({ event }) => ({ from: event.range.from, to: event.range.to })) },
      },
    },
    open: {
      on: {
        PICK_START: {
          guard: 'eligible',
          // A start after the current end invalidates the end; the admin then picks a new one.
          actions: assign(({ context, event }) => ({
            from: event.date,
            to: context.to !== null && context.to < event.date ? null : context.to,
          })),
        },
        PICK_END: {
          guard: and(['eligible', 'endNotBeforeStart']),
          actions: assign(({ event }) => ({ to: event.date })),
        },
        APPLY: {
          guard: 'complete',
          target: 'closed',
          actions: emit(({ context }) => ({
            type: 'applied' as const,
            range: { from: context.from as DateKey, to: context.to as DateKey },
          })),
        },
        CANCEL: { target: 'closed' },
      },
    },
  },
});
