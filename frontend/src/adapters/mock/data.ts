/**
 * Dummy backend data. The Piiksutajad schedule reproduces design/avaldatud põhjad-1.png
 * so the UI can be compared against the original pixel for pixel.
 * Names are mixed Estonian / Russian / English on purpose (collation, i18n, cyrillic fonts).
 */
import { CURRENT_FESTIVAL } from '../../config/runtime';
import type { FestivalId, LocationId, TeamId, VolunteerId } from '../../domain/brand';
import { type DayEntry, EMPTY_ENTRY, setField } from '../../domain/interval';
import type { OpeningTime } from '../../domain/legend';
import type { LedgerState } from '../../domain/markLedger';
import {
  type DateKey,
  eachDay,
  HOUR_MS,
  toDateKey,
  toUtcIso,
  type UtcIso,
  type WallTime,
  wallToUtc,
  weekdayIndex,
} from '../../domain/time';
import type { Submission, Volunteer } from '../../domain/volunteers';
import type { EntryMap, TeamSchedule, Workspace } from '../../domain/workspace';
import type { Location, Team } from '../../application/ports';

export const SOLARIS = 'solaris' as LocationId;
export const PLAZA = 'coca-cola-plaza' as LocationId;
export const ARTIS = 'kino-artis' as LocationId;

export const LOCATIONS: Location[] = [
  { id: SOLARIS, name: 'Solaris' },
  { id: PLAZA, name: 'Coca-Cola Plaza' },
  { id: ARTIS, name: 'Kino Artis' },
];

export const PIIKSUTAJAD = 'piiksutajad' as TeamId;
export const PILETIKONTROLL = 'piletikontroll' as TeamId;
export const SAALIJUHID = 'saalijuhid' as TeamId;

export const TEAMS: Team[] = [
  { id: PIIKSUTAJAD, name: 'Piiksutajad' },
  { id: PILETIKONTROLL, name: 'Piletikontroll' },
  { id: SAALIJUHID, name: 'Saalijuhid' },
];

const hm = (s: string): WallTime => {
  const [h, m] = s.split(':').map(Number);
  return ((h ?? 0) * 60 + (m ?? 0)) as WallTime;
};
const k = (s: string): DateKey => toDateKey(s);

// --- Opening times (superadmin) -------------------------------------------------

function solarisOpens(d: DateKey): string | null {
  const wd = weekdayIndex(d);
  if (wd === 6) return '11:00';
  if (wd === 0) return '10:50';
  if (d === '2026-10-31') return '09:00';
  if (d === '2026-11-07' || d === '2026-11-14') return '09:15';
  return '09:45';
}

function plazaOpens(d: DateKey): string | null {
  if (weekdayIndex(d) === 6) return '11:30';
  return d === '2026-11-05' ? '09:50' : '10:50';
}

export function buildOpeningTimes(): OpeningTime[] {
  const out: OpeningTime[] = [];
  for (const d of eachDay(k('2026-10-01'), k('2026-11-30'))) {
    const s = solarisOpens(d);
    const p = plazaOpens(d);
    if (s) out.push({ locationId: SOLARIS, date: d, opensAt: wallToUtc(d, hm(s)) });
    if (p) out.push({ locationId: PLAZA, date: d, opensAt: wallToUtc(d, hm(p)) });
    out.push({ locationId: ARTIS, date: d, opensAt: wallToUtc(d, hm('12:00')) });
  }
  return out;
}

// --- Piiksutajad schedule (design screen 2) ----------------------------------

const entry = (d: DateKey, start: string | null, end: string | null): DayEntry =>
  setField(d, setField(d, EMPTY_ENTRY, 'start', start ? hm(start) : null), 'end', end ? hm(end) : null);

type Row = [day: string, start: string | null, end: string | null, ageHours: number | null];

/** Current values on screen; ageHours drives the 24h / 72h / older background. */
const DESIGN_ROWS: Row[] = [
  ['2026-10-26', '08:00', '20:00', 24 * 9],
  ['2026-10-27', '10:00', '21:45', null],
  ['2026-10-28', null, '21:45', null],
  ['2026-10-29', '10:30', '01:59', 3],
  ['2026-10-30', '09:30', '00:30', 40],
  ['2026-10-31', '11:00', '04:00', null],
  ['2026-11-02', '08:00', '20:00', 24 * 9],
  ['2026-11-03', null, null, null],
  ['2026-11-04', null, '21:45', null],
  ['2026-11-05', '08:00', '20:00', 24 * 9],
  ['2026-11-06', null, null, null],
  ['2026-11-07', '08:45', '20:00', null],
  ['2026-11-09', '08:00', '20:00', 24 * 9],
  ['2026-11-10', null, null, null],
  ['2026-11-11', null, '21:45', null],
  ['2026-11-12', '11:00', '21:45', null],
  ['2026-11-13', '11:00', '21:45', null],
  ['2026-11-14', '08:00', '20:00', null],
  ['2026-11-16', '11:00', '20:00', 50],
  ['2026-11-17', null, null, null],
  ['2026-11-18', null, '21:45', null],
  ['2026-11-19', '12:00', '16:00', 5],
  ['2026-11-20', null, null, null],
  ['2026-11-21', null, null, null],
  ['2026-11-23', '11:00', '20:00', 50],
  ['2026-11-24', null, null, null],
];

/** Saved values that differ from the screen → these fields show the U-turn button. */
const SAVED_OVERRIDES: Row[] = [
  ['2026-10-27', '10:00', '22:30', null],
  ['2026-11-13', '10:00', '21:45', null],
];

/** First published week; 27.10 differs from it, so it shows as "changed after publishing". */
const PUBLISHED_DAYS = ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30', '2026-10-31'];

function toMap(rows: Row[]): Record<DateKey, DayEntry> {
  return Object.fromEntries(rows.map(([d, s, e]) => [d, entry(k(d), s, e)]));
}

function piiksutajad(nowMs: number): TeamSchedule {
  const entries = toMap(DESIGN_ROWS);
  const saved = { ...entries, ...toMap(SAVED_OVERRIDES) };
  const published: EntryMap = Object.fromEntries(PUBLISHED_DAYS.map((d) => [d, saved[k(d)] ?? EMPTY_ENTRY]));
  const changedAt = Object.fromEntries(
    DESIGN_ROWS.filter((r) => r[3] !== null).map(([d, , , age]) => [d, toUtcIso(nowMs - (age ?? 0) * HOUR_MS)]),
  ) as Record<DateKey, UtcIso>;
  return {
    teamId: PIIKSUTAJAD,
    entries,
    saved,
    published,
    changedAt,
    status: { kind: 'scheduled', at: wallToUtc(k('2026-10-24'), hm('23:59')) },
    jointEditsUnreviewed: 0,
  };
}

function plainTeam(teamId: TeamId, start: string, end: string): TeamSchedule {
  const entries = Object.fromEntries(
    eachDay(k('2026-10-26'), k('2026-11-24'))
      .filter((d) => weekdayIndex(d) < 5)
      .map((d) => [d, entry(d, start, end)]),
  );
  return { teamId, entries, saved: entries, published: null, changedAt: {}, status: { kind: 'draft' }, jointEditsUnreviewed: 0 };
}

export function buildWorkspace(nowMs: number): Workspace {
  return {
    teams: {
      [PIIKSUTAJAD]: piiksutajad(nowMs),
      [PILETIKONTROLL]: plainTeam(PILETIKONTROLL, '09:00', '22:00'),
      [SAALIJUHID]: plainTeam(SAALIJUHID, '10:00', '23:30'),
    },
    selected: [PIIKSUTAJAD],
    range: { from: k('2026-10-26'), to: k('2026-11-24') },
    locationIds: [PLAZA, SOLARIS],
    locks: [1, 2, 3],
  };
}

/** Earlier mass-overwrite batches visible in the design: 0.50 on Wednesdays, 0.30 on 12–13.11. */
export function buildLedger(): LedgerState {
  const end = { end: 1 };
  return {
    phase: 'idle',
    nextId: 3,
    batches: {
      1: { id: 1, lightness: 0.5, values: { start: null, end: hm('21:45') } },
      2: { id: 2, lightness: 0.3, values: { start: null, end: hm('21:45') } },
    },
    marks: {
      [k('2026-10-28')]: end,
      [k('2026-11-04')]: end,
      [k('2026-11-11')]: end,
      [k('2026-11-18')]: end,
      [k('2026-11-12')]: { end: 2 },
      [k('2026-11-13')]: { end: 2 },
    },
  };
}

// --- Volunteers ------------------------------------------------------------------

type Profile = 'none' | 'few' | 'near' | 'many' | 'oneDay';

interface Seed {
  name: string;
  profile: Profile;
  teams?: TeamId[];
  locations?: LocationId[];
  festival?: FestivalId;
}

const P = PIIKSUTAJAD;
const SEEDS: Seed[] = [
  { name: 'Sipsik Kallis', profile: 'none' },
  { name: 'Lilleke Kuiva', profile: 'few' },
  { name: 'Nelly O Lead', profile: 'near' },
  { name: 'Margit Pakus', profile: 'few' },
  { name: 'Alla Kakttosin', profile: 'none' },
  { name: 'Agasina Jahu', profile: 'oneDay' },
  { name: 'Juubel Tamm', profile: 'near' },
  { name: 'Friedrich Reinhold Kreutzwald', profile: 'few' },
  { name: 'Mari Maasikas', profile: 'many' },
  { name: 'Jüri Õunapuu', profile: 'many' },
  { name: 'Kärt Põder', profile: 'many' },
  { name: 'Tõnu Ülevaine', profile: 'oneDay' },
  { name: 'Ольга Смирнова', profile: 'many' },
  { name: 'Дмитрий Козлов', profile: 'many' },
  { name: 'Анастасия Волкова', profile: 'near' },
  { name: 'Сергей Иванов', profile: 'many' },
  { name: 'Oliver Grant', profile: 'many' },
  { name: 'Emily Clarke', profile: 'many' },
  { name: "Liam O'Connor", profile: 'many' },
  { name: 'Ülle Kask', profile: 'many' },
  { name: 'Aleksei Tšernõšov', profile: 'many' },
  { name: 'Pille-Riin Sepp', profile: 'many', teams: [P, PILETIKONTROLL] },
  { name: 'Johannes Västrik', profile: 'many' },
  { name: 'Kristjan Jaani', profile: 'many' },
  { name: 'Мария Петрова', profile: 'many' },
  { name: 'Noah Fischer', profile: 'many' },
  { name: 'Eha Ennok', profile: 'many' },
  { name: 'Grete Lind', profile: 'none', locations: [ARTIS] },
  // Other teams
  { name: 'Kaspar Kuusk', profile: 'many', teams: [PILETIKONTROLL] },
  { name: 'Наталья Орлова', profile: 'few', teams: [PILETIKONTROLL] },
  { name: 'Hannah Becker', profile: 'near', teams: [SAALIJUHID] },
  { name: 'Rasmus Rebane', profile: 'none', teams: [SAALIJUHID] },
  // Previous festival — filtered out internally, never shown
  { name: 'Vana Vabatahtlik', profile: 'many', festival: 'poff-29' as FestivalId },
];

export function buildVolunteers(): Volunteer[] {
  return SEEDS.map((s, i) => ({
    id: `v${i + 1}` as VolunteerId,
    name: s.name,
    festivalId: s.festival ?? CURRENT_FESTIVAL,
    teamIds: s.teams ?? [P],
    locationIds: s.locations ?? [SOLARIS, PLAZA],
  }));
}

/** Deterministic PRNG (mulberry32) so the mock data is stable between reloads and tests. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSubmissions(volunteers: readonly Volunteer[]): Submission[] {
  const rnd = mulberry32(30);
  const days = eachDay(k('2026-10-26'), k('2026-11-24')).filter((d) => weekdayIndex(d) !== 6 && d !== '2026-10-28');
  const out: Submission[] = [];
  const sub = (v: Volunteer, d: DateKey, a: string, b: string) =>
    out.push({ volunteerId: v.id, date: d, start: wallToUtc(d, hm(a)), end: wallToUtc(d, hm(b)) });

  volunteers.forEach((v, i) => {
    const profile = SEEDS[i]?.profile ?? 'none';
    const pick = (n: number) => [...days].sort(() => rnd() - 0.5).slice(0, n).filter((d) => d !== '2026-10-27');
    if (profile === 'few') pick(2).forEach((d) => sub(v, d, '12:00', '15:00'));
    if (profile === 'near') pick(6).slice(0, 5).forEach((d) => sub(v, d, '14:00', '16:00')), sub(v, k('2026-11-20'), '18:00', '19:00');
    if (profile === 'many') pick(12).forEach((d) => sub(v, d, '11:00', '15:00'));
    if (profile === 'oneDay') {
      sub(v, k('2026-11-14'), '09:00', '17:00');
      sub(v, k('2026-11-19'), '13:00', '15:00');
    }
  });

  // 27.10: 17 Piiksutajad submitted; 3 of them past 21:45 → the edit to 21:45 notifies them.
  const onTeam = volunteers.filter((v, i) => SEEDS[i]?.profile === 'many' && v.teamIds.includes(P) && v.festivalId === CURRENT_FESTIVAL);
  onTeam.slice(0, 17).forEach((v, i) => (i < 3 ? sub(v, k('2026-10-27'), '19:00', '22:30') : sub(v, k('2026-10-27'), '12:00', '18:00')));
  return out;
}

