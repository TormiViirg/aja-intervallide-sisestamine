/**
 * Values the backend will supply later. Change them here; the mock adapters and tests read them.
 */
import type { FestivalId } from '../domain/brand';
import type { EligibilityWindow } from '../domain/schedule';
import { parseUtc } from '../domain/time';
import { DEFAULT_THRESHOLDS, type FeedbackThresholds } from '../domain/volunteers';

/**
 * Which calendar days the range picker offers.
 * 2026-09-30T21:00Z = 1 Oct 00:00 Tallinn (EEST), 2026-11-30T22:00Z = 1 Dec 00:00 Tallinn (EET),
 * so 1 Oct … 30 Nov 2026 are eligible.
 */
export const ELIGIBILITY_WINDOW: EligibilityWindow = {
  fromUtc: parseUtc('2026-09-30T21:00:00Z'),
  untilUtc: parseUtc('2026-11-30T22:00:00Z'),
};

/** Volunteers are filtered by festival internally; the UI never shows this choice. */
export const CURRENT_FESTIVAL = 'poff-30' as FestivalId;

export const FEEDBACK_THRESHOLDS: FeedbackThresholds = DEFAULT_THRESHOLDS;

/** Simulated network latency of the mock adapters, in ms. */
export const MOCK_LATENCY_MS = 250;
