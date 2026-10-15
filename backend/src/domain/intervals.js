// Times are "HH:MM" UTC strings.
export const toMin = (s) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s ?? ''); return m ? +m[1] * 60 + +m[2] : null; };
/** status: empty | invalid | zero | beforeOpen | crossesMidnight | ok */
export function classify({ start, end } = {}, { open } = {}) {
  if (!start && !end) return { status: 'empty', valid: true, minutes: 0 };
  const s = toMin(start), e = toMin(end);
  if (s === null || e === null) return { status: 'invalid', valid: false, minutes: 0 };
  if (s === e) return { status: 'zero', valid: false, minutes: 0 };
  const minutes = (e - s + 1440) % 1440;
  if (e < s) return { status: 'crossesMidnight', valid: true, minutes };
  const o = toMin(open);
  return { status: o !== null && s < o ? 'beforeOpen' : 'ok', valid: true, minutes };
}
export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
