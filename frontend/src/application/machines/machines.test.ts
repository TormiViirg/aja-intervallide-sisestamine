/**
 * State machines — transitions and guards
 * ┌───────────────┬───────────────────────────────────────────────────────────────────────────┐
 * │ machine       │ cases                                                                     │
 * ├───────────────┼───────────────────────────────────────────────────────────────────────────┤
 * │ paint         │ tap paints 1 day · drag paints each day once (re-entry ignored)           │
 * │               │ hold < 700 ms → no fill · hold = 700 ms → fillAll · UP resets stroke      │
 * │ rangePicker   │ eligible start/end (config window) · day before window rejected          │
 * │               │ end before start rejected · start after end clears end                   │
 * │               │ APPLY only when complete · CANCEL keeps committed range                  │
 * │ workflow      │ editing→overview→submitting→editing (ok) · →overview + error (rejected)   │
 * │               │ thrown error → network · BACK returns to editing                         │
 * └───────────────┴───────────────────────────────────────────────────────────────────────────┘
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import { ELIGIBILITY_WINDOW } from '../../config/runtime';
import { addDays, type DateKey, tallinnDateOf, toDateKey, toUtcIso, utcMs } from '../../domain/time';
import type { PublishChoice } from '../../domain/publish';
import type { PublishResult } from '../ports';
import { HOLD_TO_FILL_MS, paintMachine } from './paintMachine';
import { rangePickerMachine } from './rangePickerMachine';
import { workflowMachine } from './workflowMachine';

const d = (s: string): DateKey => toDateKey(s);

describe('paintMachine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function start() {
    const actor = createActor(paintMachine).start();
    const painted: string[] = [];
    let fills = 0;
    actor.on('paint', (e) => painted.push(e.date));
    actor.on('fillAll', () => fills++);
    return { actor, painted, fills: () => fills };
  }

  it('paints the tapped day once', () => {
    const { actor, painted } = start();
    actor.send({ type: 'DOWN', date: d('2026-10-26') });
    actor.send({ type: 'UP' });
    expect(painted).toEqual(['2026-10-26']);
    expect(actor.getSnapshot().value).toBe('idle');
  });

  it('paints every entered day once per stroke', () => {
    const { actor, painted } = start();
    actor.send({ type: 'DOWN', date: d('2026-10-26') });
    actor.send({ type: 'ENTER', date: d('2026-10-27') });
    actor.send({ type: 'ENTER', date: d('2026-10-26') });
    actor.send({ type: 'ENTER', date: d('2026-10-28') });
    actor.send({ type: 'UP' });
    expect(painted).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  });

  it('a new stroke may paint the same day again', () => {
    const { actor, painted } = start();
    actor.send({ type: 'DOWN', date: d('2026-10-26') });
    actor.send({ type: 'UP' });
    actor.send({ type: 'DOWN', date: d('2026-10-26') });
    expect(painted).toEqual(['2026-10-26', '2026-10-26']);
  });

  it('does not fill everything when released 1 ms before the hold time', () => {
    const { actor, fills } = start();
    actor.send({ type: 'DOWN', date: d('2026-10-26') });
    vi.advanceTimersByTime(HOLD_TO_FILL_MS - 1);
    actor.send({ type: 'UP' });
    vi.advanceTimersByTime(10);
    expect(fills()).toBe(0);
  });

  it('fills all days after holding exactly the hold time', () => {
    const { actor, fills } = start();
    actor.send({ type: 'DOWN', date: d('2026-10-26') });
    vi.advanceTimersByTime(HOLD_TO_FILL_MS);
    expect(fills()).toBe(1);
    expect(actor.getSnapshot().value).toBe('filledAll');
  });

  it('dragging cancels the hold-to-fill timer', () => {
    const { actor, fills } = start();
    actor.send({ type: 'DOWN', date: d('2026-10-26') });
    actor.send({ type: 'ENTER', date: d('2026-10-27') });
    vi.advanceTimersByTime(HOLD_TO_FILL_MS * 2);
    expect(fills()).toBe(0);
  });
});

describe('rangePickerMachine (eligibility from config)', () => {
  const first = tallinnDateOf(utcMs(ELIGIBILITY_WINDOW.fromUtc));
  const last = addDays(tallinnDateOf(utcMs(ELIGIBILITY_WINDOW.untilUtc)), -1);
  function open() {
    const actor = createActor(rangePickerMachine, { input: { eligibility: ELIGIBILITY_WINDOW } }).start();
    const applied: unknown[] = [];
    actor.on('applied', (e) => applied.push(e.range));
    actor.send({ type: 'OPEN', range: { from: d('2026-10-26'), to: d('2026-11-24') } });
    return { actor, applied };
  }

  it('accepts the first and last eligible day', () => {
    const { actor } = open();
    actor.send({ type: 'PICK_START', date: first });
    actor.send({ type: 'PICK_END', date: last });
    expect(actor.getSnapshot().context).toMatchObject({ from: first, to: last });
  });

  it('rejects the day before the window and the day after it', () => {
    const { actor } = open();
    actor.send({ type: 'PICK_START', date: addDays(first, -1) });
    actor.send({ type: 'PICK_END', date: addDays(last, 1) });
    expect(actor.getSnapshot().context).toMatchObject({ from: '2026-10-26', to: '2026-11-24' });
  });

  it('rejects an end before the start, accepts an end equal to the start', () => {
    const { actor } = open();
    actor.send({ type: 'PICK_END', date: d('2026-10-25') });
    expect(actor.getSnapshot().context.to).toBe('2026-11-24');
    actor.send({ type: 'PICK_END', date: d('2026-10-26') });
    expect(actor.getSnapshot().context.to).toBe('2026-10-26');
  });

  it('clears the end when the start moves past it, and blocks APPLY until a new end', () => {
    const { actor, applied } = open();
    actor.send({ type: 'PICK_START', date: d('2026-11-25') });
    expect(actor.getSnapshot().context.to).toBeNull();
    actor.send({ type: 'APPLY' });
    expect(actor.getSnapshot().value).toBe('open');
    actor.send({ type: 'PICK_END', date: d('2026-11-27') });
    actor.send({ type: 'APPLY' });
    expect(applied).toEqual([{ from: '2026-11-25', to: '2026-11-27' }]);
    expect(actor.getSnapshot().value).toBe('closed');
  });

  it('CANCEL emits nothing', () => {
    const { actor, applied } = open();
    actor.send({ type: 'PICK_START', date: d('2026-10-27') });
    actor.send({ type: 'CANCEL' });
    expect(applied).toEqual([]);
  });
});

describe('workflowMachine', () => {
  const ok: PublishResult = { ok: true, status: { kind: 'published', at: toUtcIso(0) } };
  function withSubmit(fn: (choice: PublishChoice) => Promise<PublishResult>) {
    return createActor(
      workflowMachine.provide({ actors: { submit: fromPromise(({ input }: { input: { choice: PublishChoice } }) => fn(input.choice)) } }),
    ).start();
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('returns to editing and emits submitted on success', async () => {
    const actor = withSubmit(async () => ok);
    const seen: string[] = [];
    actor.on('submitted', (e) => seen.push(e.choice.kind));
    actor.send({ type: 'REVIEW' });
    actor.send({ type: 'SUBMIT', choice: { kind: 'now' } });
    expect(actor.getSnapshot().value).toBe('submitting');
    await settle();
    expect(actor.getSnapshot().value).toBe('editing');
    expect(seen).toEqual(['now']);
  });

  it('stays on the overview with the backend error', async () => {
    const actor = withSubmit(async () => ({ ok: false, error: 'validation' }));
    actor.send({ type: 'REVIEW' });
    actor.send({ type: 'SUBMIT', choice: { kind: 'draft' } });
    await settle();
    expect(actor.getSnapshot()).toMatchObject({ value: 'overview', context: { error: 'validation' } });
  });

  it('maps a thrown error to network', async () => {
    const actor = withSubmit(async () => {
      throw new Error('offline');
    });
    actor.send({ type: 'REVIEW' });
    actor.send({ type: 'SUBMIT', choice: { kind: 'now' } });
    await settle();
    expect(actor.getSnapshot().context.error).toBe('network');
  });

  it('BACK returns to editing; SUBMIT is ignored while editing', () => {
    const actor = withSubmit(async () => ok);
    actor.send({ type: 'SUBMIT', choice: { kind: 'now' } });
    expect(actor.getSnapshot().value).toBe('editing');
    actor.send({ type: 'REVIEW' });
    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toBe('editing');
  });
});
