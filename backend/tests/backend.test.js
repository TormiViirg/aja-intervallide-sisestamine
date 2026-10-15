// Every test names the equivalence class (EC) or boundary value (BV) it covers.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { classify, toMin, isIsoDate } from '../src/domain/intervals.js';
import { inRange } from '../src/domain/config.js';
import { impact, filterVolunteers } from '../src/domain/volunteers.js';
import { parseScheduled } from '../src/domain/schedule.js';
import { createMemoryRepository, SEED_VOLUNTEERS } from '../src/adapters/memoryRepository.js';
import { createSupabaseRepository } from '../src/adapters/supabaseRepository.js';
import { createScheduleService, ValidationError } from '../src/services/scheduleService.js';
import { runContract } from './repository.contract.js';

runContract('memory', () => createMemoryRepository());
test('Supabase repository maps reads, filters volunteers, and persists schedules', async () => {
  const rows = {
    app_config: { allowed_range: { from: '2026-10-26', to: '2026-11-24' }, opening_times: { open: '07:45', close: '19:45', cinema: 'Solaris' } },
    teams: [{ id: 'usher', name: 'Piletikontroll' }],
    volunteers: [{ id: 1, name: 'Mari Tamm', festival: 'poff30', team: 'usher', location: 'Solaris', opened: [] }],
    drafts: null,
    publications: [],
  };
  const queries = [];
  const client = { from: (table) => {
    const filters = [];
    queries.push({ table, filters });
    return {
      select() { return this; },
      eq(column, value) { filters.push(['eq', column, value]); return this; },
      in(column, value) { filters.push(['in', column, value]); return this; },
      order() { return this; },
      single: async () => ({ data: rows[table], error: null }),
      maybeSingle: async () => ({ data: rows[table], error: null }),
      upsert: async (record) => { rows.drafts = { schedule: record.schedule }; return { data: null, error: null }; },
      insert: async (record) => { rows.publications.push(record); return { data: null, error: null }; },
      then: (resolve, reject) => Promise.resolve({ data: rows[table], error: null }).then(resolve, reject),
    };
  } };
  const repo = createSupabaseRepository(client);
  assert.deepEqual(await repo.getConfig(), { allowedRange: rows.app_config.allowed_range, openingTimes: rows.app_config.opening_times });
  assert.deepEqual(await repo.listTeams(), rows.teams);
  assert.deepEqual(await repo.listVolunteers({ festival: 'poff30', team: 'usher', locations: ['Solaris'] }), rows.volunteers);
  assert.deepEqual(queries.at(-1).filters, [['eq', 'festival', 'poff30'], ['eq', 'team', 'usher'], ['in', 'location', ['Solaris']]]);

  const values = { '2026-10-27': { start: '10:00', end: '12:00' } };
  await repo.saveDraft('usher', values);
  assert.deepEqual(await repo.getDraft('usher'), values);
  const publication = { values, publishAt: '2026-10-15T10:00:00.000Z', status: 'published' };
  await repo.savePublication('usher', publication);
  assert.deepEqual(rows.publications[0], { team_id: 'usher', schedule: values, publish_at: publication.publishAt, status: 'published' });
});

const NOW = new Date('2026-10-15T10:00:00Z'); // Estonia is UTC+3 (EEST) until 2026-10-25
const svc = () => { const repo = createMemoryRepository(); return { repo, s: createScheduleService({ repo, clock: () => NOW }) }; };
const ok = { '2026-10-27': { start: '10:00', end: '21:45' } };

test('BV time format: 00:00/23:59 valid; 24:00, 23:60, 8:00, "", null invalid', () => {
  assert.equal(toMin('00:00'), 0); assert.equal(toMin('23:59'), 1439);
  for (const b of ['24:00', '23:60', '8:00', 'ab:cd', '', null]) assert.equal(toMin(b), null);
});
test('EC interval status classes + BV open-1/open, start==end, max duration', () => {
  const o = { open: '09:45' };
  assert.equal(classify({}, o).status, 'empty'); assert.equal(classify({ start: '10:00', end: 'x' }, o).status, 'invalid');
  assert.equal(classify({ start: '10:00', end: '10:00' }, o).status, 'zero');
  assert.equal(classify({ start: '09:44', end: '12:00' }, o).status, 'beforeOpen'); assert.equal(classify({ start: '09:45', end: '12:00' }, o).status, 'ok');
  assert.equal(classify({ start: '22:00', end: '02:00' }, o).minutes, 240); assert.equal(classify({ start: '10:00', end: '09:59' }, o).minutes, 1439);
});
test('BV allowed UTC range: from-1, from, to, to+1; single-day custom range', () => {
  assert.deepEqual(['2026-10-25', '2026-10-26', '2026-11-24', '2026-11-25'].map((d) => inRange(d)), [false, true, true, false]);
  assert.equal(inRange('2026-11-01', { from: '2026-11-01', to: '2026-11-01' }), true);
});
test('EC date strings: real date valid; 2026-02-30, 2026-1-1, garbage invalid', () => {
  assert.ok(isIsoDate('2026-10-27')); for (const b of ['2026-02-30', '2026-1-1', 'x', '']) assert.ok(!isIsoDate(b));
});
test('impact: untouched → none; same times → affected, not notified; 1-minute change → notified', () => {
  const v = filterVolunteers(SEED_VOLUNTEERS, { festival: 'poff30', team: 'usher' });
  assert.deepEqual(impact(v, { '2026-11-02': { start: '1', end: '2' } }), { affected: [], toNotify: [] });
  assert.deepEqual([1, 0], (({ affected, toNotify }) => [affected.length, toNotify.length])(impact(v, ok)));
  assert.equal(impact(v, { '2026-10-27': { start: '10:01', end: '21:45' } }).toNotify.length, 1);
});
test('schedule time: now rejected (BV), +1 min ok, DST offset +3 before 10-25 / +2 after, bad format null', () => {
  assert.equal(parseScheduled('2026-10-15T13:00', NOW), null);
  assert.equal(parseScheduled('2026-10-15T13:01', NOW).toISOString(), '2026-10-15T10:01:00.000Z');
  assert.equal(parseScheduled('2026-10-26T12:00', NOW).toISOString(), '2026-10-26T10:00:00.000Z');
  for (const b of ['garbage', '2026-10-26T24:00', '2026-10-26T12:60', undefined]) assert.equal(parseScheduled(b, NOW), null);
});
test('service validate: out-of-range, invalid time, non-object values', async () => {
  const { s } = svc();
  assert.deepEqual(await s.validate(ok), []);
  assert.equal((await s.validate({ '2026-10-25': { start: '08:00', end: '16:00' } }))[0].code, 'date_out_of_range');
  assert.equal((await s.validate({ '2026-10-27': { start: '8:00', end: '16:00' } }))[0].code, 'invalid');
  assert.equal((await s.validate([]))[0].code, 'values_must_be_object');
});
test('service publish now: stores publication and reports names (multilingual) of people to notify', async () => {
  const { repo, s } = svc();
  const r = await s.publish('usher', { mode: 'now', values: { '2026-10-27': { start: '10:30', end: '21:45' } } });
  assert.equal(r.status, 'published'); assert.deepEqual(r.toNotify, ['Mari Tamm']); assert.equal(repo._publications.get('usher').status, 'published');
});
test('service publish scheduled: past rejected, future stored; unknown mode rejected; invalid data never stored', async () => {
  const { repo, s } = svc();
  await assert.rejects(s.publish('usher', { mode: 'scheduled', values: ok, at: '2026-10-15T13:00' }), ValidationError);
  assert.equal((await s.publish('usher', { mode: 'scheduled', values: ok, at: '2026-10-16T09:00' })).status, 'scheduled');
  await assert.rejects(s.publish('usher', { mode: 'later', values: ok }), ValidationError);
  const bad = createMemoryRepository(); const s2 = createScheduleService({ repo: bad, clock: () => NOW });
  await assert.rejects(s2.publish('usher', { mode: 'now', values: { '2026-10-27': { start: '99:00', end: '10:00' } } }), ValidationError);
  assert.equal(bad._publications.size, 0);
});
test('service draft mode saves per team even when incomplete/invalid', async () => {
  const { repo, s } = svc(); await s.publish('usher', { mode: 'draft', values: { '2026-10-27': { start: '9' } } });
  assert.equal((await repo.getDraft('usher'))['2026-10-27'].start, '9'); assert.deepEqual(await repo.getDraft('press'), {});
});
