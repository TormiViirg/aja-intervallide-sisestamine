/**
 * Achromatic OKLCH colours. Lightness was sampled from the design exports
 * (sRGB → OKLab), so the legend greys match the original.
 *
 * Because every colour here has chroma 0, perceptual contrast in OKLCH reduces to
 * |ΔL| — which turns "pick the most distinct grey" into a 1-D maximin problem.
 */
import type { Recency } from './legend';

export const PAPER = 1;
export const INK = 0;

export const RECENCY_LIGHTNESS = {
  none: 1,
  day: 0.676,
  threeDays: 0.823,
  older: 0.925,
} as const satisfies Record<Recency, number>;

export const MIDNIGHT_HALO_LIGHTNESS = 0.851;

export function oklchGray(lightness: number): string {
  return `oklch(${round3(lightness)} 0 0)`;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface GrayPickOptions {
  /** Darkest allowed result. */
  min?: number;
  /** Lightest allowed result. */
  max?: number;
  /** Search resolution in lightness units. */
  step?: number;
}

/**
 * Maximin search: the grey in [min, max] whose nearest occupied lightness is furthest away.
 * Ties go to the darker candidate so results are deterministic.
 * With nothing occupied it returns the darkest allowed grey.
 */
export function pickMaxContrastGray(
  occupied: readonly number[],
  { min = 0.15, max = 0.85, step = 0.005 }: GrayPickOptions = {},
): number {
  if (min > max) throw new RangeError('min must not exceed max');
  const lo = Math.round(min / step);
  const hi = Math.round(max / step);
  let best = lo * step;
  let bestScore = -1;
  for (let i = lo; i <= hi; i++) {
    const candidate = i * step;
    const score = occupied.length
      ? Math.min(...occupied.map((o) => Math.abs(o - candidate)))
      : Number.POSITIVE_INFINITY;
    if (score > bestScore + 1e-9) {
      best = candidate;
      bestScore = score;
    }
  }
  return round3(best);
}

/** Smallest pairwise |ΔL| in a set — used by tests to assert batch colours stay distinguishable. */
export function minSeparation(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < s.length; i++) gap = Math.min(gap, (s[i] ?? 0) - (s[i - 1] ?? 0));
  return gap;
}
