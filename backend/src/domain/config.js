// Inclusive UTC date window. In production it comes from the repository (Supabase) via getConfig().
export const DEFAULT_ALLOWED_RANGE = { from: '2026-10-26', to: '2026-11-24' };
export const inRange = (iso, r = DEFAULT_ALLOWED_RANGE) => iso >= r.from && iso <= r.to;
