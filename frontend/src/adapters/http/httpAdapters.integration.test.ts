// @vitest-environment node
/**
 * Contract test: the frontend's HTTP adapters against the real Express app from backend/
 * (unchanged, in-memory repository), served on a random port.
 *
 * ┌────┬───────────────────────────────────────────────────┬────────────────────────────────────────┐
 * │ id │ scenario                                          │ class / boundary                       │
 * ├────┼───────────────────────────────────────────────────┼────────────────────────────────────────┤
 * │ C1 │ reference data                                    │ teams, Solaris, 26.10–24.11 window     │
 * │ C2 │ volunteers                                        │ previous-festival volunteer filtered   │
 * │ C3 │ draft save → fresh load                           │ round trip incl. overnight + clearing  │
 * │ C4 │ publish now                                       │ complete days accepted                 │
 * │ C5 │ publish with a start-only day                     │ 422 → validation error, nothing stored │
 * │ C6 │ scheduled publish                                 │ future accepted · past rejected        │
 * │ C7 │ preview impact                                    │ opened on edited day → affected;       │
 * │    │                                                   │ same times → not notified              │
 * └────┴───────────────────────────────────────────────────┴────────────────────────────────────────┘
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '../browser/clocks';
import type { TeamId } from '../../domain/brand';
import { EMPTY_ENTRY, entryWall, setField } from '../../domain/interval';
import { toDateKey, toUtcIso, type WallTime, wallToUtc } from '../../domain/time';
import { createApiClient } from './apiClient';
import { createHttpPorts } from './httpAdapters';

/** The slice of node:http Server this test uses (the app tsconfig has no Node types). */
interface Server {
  address(): { port: number } | string | null;
  close(cb: () => void): void;
}

const USHER = 'usher' as TeamId;
const NOW = Date.parse('2026-10-15T09:00:00Z');
const day = (k: string, s: number | null, e: number | null) => {
  const d = toDateKey(k);
  return setField(d, setField(d, EMPTY_ENTRY, 'start', s as WallTime | null), 'end', e as WallTime | null);
};

let server: Server;
let base = '';

beforeAll(async () => {
  // Imported by URL so the backend stays plain JS outside this TypeScript project.
  const appUrl = new URL('../../../../backend/src/app.js', import.meta.url).href;
  const { createApp } = (await import(/* @vite-ignore */ appUrl)) as { createApp: (o?: object) => { listen: (p: number, cb: () => void) => Server } };
  await new Promise<void>((resolve) => {
    server = createApp({ clock: () => new Date(NOW) }).listen(0, resolve);
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const ports = () => createHttpPorts(createApiClient(base), fixedClock(NOW));

describe('frontend HTTP adapters ⇄ Express backend', () => {
  it('C1 loads reference data', async () => {
    const ref = await ports().reference.load();
    expect(ref.teams.map((t) => t.name)).toEqual(['Piletikontroll', 'Press']);
    expect(ref.locations).toEqual([{ id: 'Solaris', name: 'Solaris' }]);
    expect(ref.eligibility.fromUtc).toBe(wallToUtc(toDateKey('2026-10-26'), 0));
    expect(ref.openingTimes).toHaveLength(30);
  });

  it('C2 lists only this festival’s volunteers with their opened intervals', async () => {
    const p = ports();
    const vols = await p.volunteers.listVolunteers('poff30' as never);
    expect(vols.map((v) => v.name)).toEqual(expect.arrayContaining(['Mari Tamm', 'Jaan Kask', 'Анна Иванова', 'Olga Mägi']));
    expect(vols.map((v) => v.name)).not.toContain('Old Festival Vol');
    const subs = await p.volunteers.listSubmissions('poff30' as never);
    expect(subs).toContainEqual({
      volunteerId: '1',
      date: '2026-10-27',
      start: wallToUtc(toDateKey('2026-10-27'), 600),
      end: wallToUtc(toDateKey('2026-10-27'), 21 * 60 + 45),
    });
  });

  it('C3 saves a draft and reads it back on a fresh load, including overnight and cleared days', async () => {
    const first = ports();
    await first.schedules.loadWorkspace('poff30' as never);
    await first.schedules.saveDraft(USHER, { [toDateKey('2026-10-29')]: day('2026-10-29', 630, 119), [toDateKey('2026-10-30')]: day('2026-10-30', 540, 1200) });
    await first.schedules.saveDraft(USHER, { [toDateKey('2026-10-29')]: day('2026-10-29', 630, 119) });

    const ws = await ports().schedules.loadWorkspace('poff30' as never);
    const team = ws.teams[USHER]!;
    expect(entryWall(toDateKey('2026-10-29'), team.entries[toDateKey('2026-10-29')]!)).toEqual({ start: 630, end: 119, endDayOffset: 1 });
    expect(team.entries[toDateKey('2026-10-30')]).toBeUndefined();
    expect(ws.range).toEqual({ from: '2026-10-26', to: '2026-11-24' });
  });

  it('C4 publishes complete days now', async () => {
    const r = await ports().schedules.publish([USHER], { kind: 'now' }, { [USHER]: { [toDateKey('2026-10-27')]: day('2026-10-27', 600, 1305) } });
    expect(r).toEqual({ ok: true, status: { kind: 'published', at: toUtcIso(NOW) } });
  });

  it('C5 reports a start-only day as a validation error', async () => {
    const r = await ports().schedules.publish([USHER], { kind: 'now' }, { [USHER]: { [toDateKey('2026-10-27')]: day('2026-10-27', 600, null) } });
    expect(r).toMatchObject({ ok: false, error: 'validation' });
    expect(r.ok ? '' : r.detail).toContain('2026-10-27');
  });

  it('C6 schedules in Estonian time: future accepted, past rejected', async () => {
    const values = { [USHER]: { [toDateKey('2026-10-27')]: day('2026-10-27', 600, 1305) } };
    const future = wallToUtc(toDateKey('2026-10-24'), 23 * 60 + 59);
    expect(await ports().schedules.publish([USHER], { kind: 'scheduled', at: future }, values)).toEqual({
      ok: true,
      status: { kind: 'scheduled', at: future },
    });
    const past = toUtcIso(NOW - 60_000);
    expect(await ports().schedules.publish([USHER], { kind: 'scheduled', at: past }, values)).toMatchObject({ ok: false, error: 'validation' });
  });

  it('C7 previews who is affected and who must be notified', async () => {
    const p = ports().schedules;
    const changed = await p.previewImpact!(USHER, { [toDateKey('2026-10-27')]: day('2026-10-27', 600, 1200) }, []);
    expect(changed).toEqual({ affected: ['Mari Tamm'], notify: ['Mari Tamm'] });
    const same = await p.previewImpact!(USHER, { [toDateKey('2026-10-27')]: day('2026-10-27', 600, 1305) }, []);
    expect(same).toEqual({ affected: ['Mari Tamm'], notify: [] });
    expect(await p.previewImpact!(USHER, { [toDateKey('2026-10-27')]: day('2026-10-27', 600, null) }, [])).toBeNull();
  });
});
