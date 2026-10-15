/**
 * Text size of the live-feedback panel, stepped in 2 pt increments.
 * Smaller text earns more visible rows per group so the panel keeps roughly the same height.
 */
export const FEEDBACK_MIN_PT = 7;
export const FEEDBACK_MAX_PT = 15;
export const FEEDBACK_STEP_PT = 2;
export const FEEDBACK_DEFAULT_PT = 11;

/** Row budget: the design shows 7 names per column at its 11 pt default. */
const ROW_POINT_BUDGET = 77;

export function stepFeedbackSize(pt: number, direction: 1 | -1): number {
  const next = pt + direction * FEEDBACK_STEP_PT;
  return Math.min(FEEDBACK_MAX_PT, Math.max(FEEDBACK_MIN_PT, next));
}

/** 7 pt → 11 rows · 9 → 8 · 11 → 7 · 13 → 5 · 15 → 5. */
export function rowsForSize(pt: number): number {
  const clamped = Math.min(FEEDBACK_MAX_PT, Math.max(FEEDBACK_MIN_PT, pt));
  return Math.floor(ROW_POINT_BUDGET / clamped);
}

export const ptToPx = (pt: number): number => (pt * 4) / 3;
