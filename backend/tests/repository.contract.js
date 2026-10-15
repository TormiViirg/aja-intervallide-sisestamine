// Reusable contract: call runContract(makeRepo) for ANY adapter (memory now, Supabase later).
import { test } from 'node:test'; import assert from 'node:assert/strict';
export function runContract(name, makeRepo) {
  test(`${name}: config has allowedRange (from<=to) and openingTimes`, async () => { const c = await makeRepo().getConfig(); assert.ok(c.allowedRange.from <= c.allowedRange.to); assert.ok(c.openingTimes.open); });
  test(`${name}: volunteers filtered by festival+team (EC), location optional`, async () => {
    const r = makeRepo();
    assert.equal((await r.listVolunteers({ festival: 'poff30', team: 'usher', locations: [] })).length, 3);
    assert.equal((await r.listVolunteers({ festival: 'poff30', team: 'usher', locations: ['Solaris'] })).length, 2);
    assert.equal((await r.listVolunteers({ festival: 'poff29', team: 'usher', locations: [] })).length, 1);
    assert.equal((await r.listVolunteers({ festival: 'none', team: 'usher', locations: [] })).length, 0);
  });
  test(`${name}: drafts are per team and independent`, async () => {
    const r = makeRepo(); await r.saveDraft('usher', { '2026-10-27': { start: '10:00', end: '12:00' } });
    assert.deepEqual(await r.getDraft('press'), {}); assert.equal((await r.getDraft('usher'))['2026-10-27'].start, '10:00');
  });
}
