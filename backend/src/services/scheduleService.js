import { classify, isIsoDate } from '../domain/intervals.js';
import { inRange } from '../domain/config.js';
import { impact } from '../domain/volunteers.js';
import { parseScheduled } from '../domain/schedule.js';
const FESTIVAL = 'poff30';
export class ValidationError extends Error { constructor(errors) { super('validation_failed'); this.errors = errors; } }

export function createScheduleService({ repo, clock = () => new Date() }) {
  async function validate(values) {
    const cfg = await repo.getConfig(); const errors = [];
    if (values === null || typeof values !== 'object' || Array.isArray(values)) return [{ code: 'values_must_be_object' }];
    for (const [date, v] of Object.entries(values)) {
      if (!isIsoDate(date) || !inRange(date, cfg.allowedRange)) { errors.push({ date, code: 'date_out_of_range' }); continue; }
      const c = classify(v ?? {}, cfg.openingTimes);
      if (!c.valid) errors.push({ date, code: c.status });
    }
    return errors;
  }
  async function preview(team, values, locations = []) {
    const errors = await validate(values); if (errors.length) throw new ValidationError(errors);
    const vols = await repo.listVolunteers({ festival: FESTIVAL, team, locations });
    const { affected, toNotify } = impact(vols, values);
    return { affected: affected.map((v) => v.name), toNotify: toNotify.map((v) => v.name), affectedCount: affected.length, toNotifyCount: toNotify.length };
  }
  async function publish(team, { values, mode, at }) {
    if (mode === 'draft') { await repo.saveDraft(team, values ?? {}); return { ok: true, status: 'draft' }; } // drafts may be invalid/incomplete
    if (mode !== 'now' && mode !== 'scheduled') throw new ValidationError([{ code: 'unknown_mode' }]);
    const result = await preview(team, values);
    let when = clock();
    if (mode === 'scheduled') { when = parseScheduled(at, clock()); if (!when) throw new ValidationError([{ code: 'schedule_in_past_or_invalid' }]); }
    await repo.savePublication(team, { values, publishAt: when, status: mode === 'now' ? 'published' : 'scheduled' });
    return { ok: true, status: mode === 'now' ? 'published' : 'scheduled', publishAt: when.toISOString(), ...result };
  }
  return { validate, preview, publish };
}
