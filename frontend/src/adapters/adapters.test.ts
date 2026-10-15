/**
 * Adapters
 * ┌──────────────────────┬─────────────────────────────────────────────────────────────────────┐
 * │ adapter              │ cases                                                               │
 * ├──────────────────────┼─────────────────────────────────────────────────────────────────────┤
 * │ cookie timezone      │ first visit writes poff_tz · same zone not rewritten · value with   │
 * │                      │ "/" round-trips · collapsed flag: unset → null, set → boolean        │
 * │ clock from URL       │ valid ?now → fixed · invalid ?now → system clock                    │
 * │ mock schedules       │ publish: no teams → validation · scheduled 1 ms before lead → reject│
 * │                      │ scheduled exactly at lead → ok · draft keeps status                 │
 * └──────────────────────┴─────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from 'vitest';
import { PIIKSUTAJAD } from './mock/data';
import { createMockSchedules } from './mock/mockAdapters';
import { clockFromLocation, fixedClock, systemClock } from './browser/clocks';
import { createCookieTimezone, TZ_COOKIE } from './browser/cookieTimezone';
import { MIN_SCHEDULE_LEAD_MS } from '../domain/publish';
import { toUtcIso } from '../domain/time';
import { memoryJar, TEST_NOW } from '../test/testPorts';

describe('cookie timezone adapter', () => {
  it('stores the device zone on first visit', () => {
    const jar = memoryJar();
    const port = createCookieTimezone(jar, () => 'America/New_York');
    expect(port.storedZone()).toBeNull();
    expect(port.rememberDeviceZone()).toBe('America/New_York');
    expect(port.storedZone()).toBe('America/New_York');
    expect(jar.all()).toContain(`${TZ_COOKIE}=America%2FNew_York`);
  });

  it('does not rewrite an unchanged zone', () => {
    let writes = 0;
    const jar = memoryJar(`${TZ_COOKIE}=Europe%2FTallinn`);
    const counting = { get: jar.get, set: (c: string) => (writes++, jar.set(c)) };
    createCookieTimezone(counting, () => 'Europe/Tallinn').rememberDeviceZone();
    expect(writes).toBe(0);
  });

  it('remembers the collapsed warning', () => {
    const port = createCookieTimezone(memoryJar(), () => 'UTC');
    expect(port.isWarningCollapsed()).toBeNull();
    port.setWarningCollapsed(true);
    expect(port.isWarningCollapsed()).toBe(true);
    port.setWarningCollapsed(false);
    expect(port.isWarningCollapsed()).toBe(false);
  });
});

describe('clockFromLocation', () => {
  it('pins a valid ?now', () => expect(clockFromLocation('?now=2026-10-15T09:00:00Z').now()).toBe(TEST_NOW));
  it('falls back to the system clock', () => expect(clockFromLocation('?now=yesterday')).toBe(systemClock));
});

describe('mock schedule repository', () => {
  const repo = () => createMockSchedules(fixedClock(TEST_NOW), 0);

  it('rejects publishing with no teams', async () => {
    expect(await repo().publish([], { kind: 'now' }, {})).toMatchObject({ ok: false, error: 'validation' });
  });

  it('rejects a schedule 1 ms inside the lead time and accepts it exactly at the lead time', async () => {
    const r = repo();
    expect(await r.publish([PIIKSUTAJAD], { kind: 'scheduled', at: toUtcIso(TEST_NOW + MIN_SCHEDULE_LEAD_MS - 1) }, {})).toMatchObject({ ok: false });
    expect(await r.publish([PIIKSUTAJAD], { kind: 'scheduled', at: toUtcIso(TEST_NOW + MIN_SCHEDULE_LEAD_MS) }, {})).toMatchObject({ ok: true });
  });

  it('saves drafts per team', async () => {
    const r = repo();
    await r.saveDraft(PIIKSUTAJAD, {});
    expect(r.savedDrafts.has(PIIKSUTAJAD)).toBe(true);
  });
});
