/**
 * Page-level workflow.
 *
 *   editing ──REVIEW──▶ overview ──SUBMIT(choice)──▶ submitting ──done(ok)──▶ editing
 *      ▲                   │                            └──done(error) / throw──▶ overview (error kept)
 *      └──────BACK─────────┘
 *
 * The `submit` actor is supplied by the app (it closes over the repository port).
 */
import { assign, emit, fromPromise, setup } from 'xstate';
import type { PublishChoice } from '../../domain/publish';
import type { PublishResult } from '../ports';

export interface WorkflowContext {
  readonly error: string | null;
  readonly lastChoice: PublishChoice | null;
}

export type WorkflowEvent =
  | { type: 'REVIEW' }
  | { type: 'BACK' }
  | { type: 'SUBMIT'; choice: PublishChoice };

export const workflowMachine = setup({
  types: {
    context: {} as WorkflowContext,
    events: {} as WorkflowEvent,
    emitted: {} as { type: 'submitted'; choice: PublishChoice; result: Extract<PublishResult, { ok: true }> },
  },
  actors: {
    submit: fromPromise<PublishResult, { choice: PublishChoice }>(async () => {
      throw new Error('submit actor not provided');
    }),
  },
}).createMachine({
  id: 'workflow',
  context: { error: null, lastChoice: null },
  initial: 'editing',
  states: {
    editing: { on: { REVIEW: { target: 'overview', actions: assign({ error: null }) } } },
    overview: {
      on: {
        BACK: 'editing',
        SUBMIT: { target: 'submitting', actions: assign(({ event }) => ({ lastChoice: event.choice, error: null })) },
      },
    },
    submitting: {
      invoke: {
        src: 'submit',
        input: ({ context }) => ({ choice: context.lastChoice as PublishChoice }),
        onDone: [
          {
            guard: ({ event }) => event.output.ok,
            target: 'editing',
            actions: emit(({ context, event }) => ({
              type: 'submitted' as const,
              choice: context.lastChoice as PublishChoice,
              result: event.output as Extract<PublishResult, { ok: true }>,
            })),
          },
          {
            target: 'overview',
            actions: assign(({ event }) => ({
              error: event.output.ok ? null : event.output.error,
            })),
          },
        ],
        onError: { target: 'overview', actions: assign({ error: 'network' }) },
      },
    },
  },
});
