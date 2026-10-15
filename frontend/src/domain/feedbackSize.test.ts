/**
 * Live-feedback text size — equivalence partitions / boundary values
 * ┌──────────────────┬──────────────────────────────┬─────────────────────┐
 * │ input            │ class                        │ expected            │
 * ├──────────────────┼──────────────────────────────┼─────────────────────┤
 * │ step from 11 +   │ inside range                 │ 13                  │
 * │ step from 15 +   │ upper bound (clamped)        │ 15                  │
 * │ step from 7 −    │ lower bound (clamped)        │ 7                   │
 * │ rows 7…15 pt     │ smaller size → more rows     │ 11,8,7,5,5          │
 * │ rows 4 pt / 40 pt│ out of range → clamped       │ 11 / 5              │
 * └──────────────────┴──────────────────────────────┴─────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX_PT, FEEDBACK_MIN_PT, rowsForSize, stepFeedbackSize } from './feedbackSize';

describe('stepFeedbackSize', () => {
  it('moves in 2 pt steps', () => expect(stepFeedbackSize(11, 1)).toBe(13));
  it('clamps at the maximum', () => expect(stepFeedbackSize(FEEDBACK_MAX_PT, 1)).toBe(FEEDBACK_MAX_PT));
  it('clamps at the minimum', () => expect(stepFeedbackSize(FEEDBACK_MIN_PT, -1)).toBe(FEEDBACK_MIN_PT));
});

describe('rowsForSize', () => {
  it.each([
    [7, 11],
    [9, 8],
    [11, 7],
    [13, 5],
    [15, 5],
    [4, 11],
    [40, 5],
  ])('%i pt → %i rows', (pt, rows) => expect(rowsForSize(pt)).toBe(rows));

  it('never gives fewer rows to a smaller size', () => {
    for (let pt = FEEDBACK_MIN_PT; pt < FEEDBACK_MAX_PT; pt += 2) {
      expect(rowsForSize(pt)).toBeGreaterThanOrEqual(rowsForSize(pt + 2));
    }
  });
});
