/**
 * In-memory adapters standing in for the backend. They validate like the backend will,
 * so the UI's error paths can be exercised before the real API exists.
 */
import { CURRENT_FESTIVAL, ELIGIBILITY_WINDOW, FEEDBACK_THRESHOLDS, MOCK_LATENCY_MS } from '../../config/runtime';
import type { TeamId } from '../../domain/brand';
import { MIN_SCHEDULE_LEAD_MS } from '../../domain/publish';
import { toUtcIso, utcMs } from '../../domain/time';
import type { EntryMap } from '../../domain/workspace';
import type { ClockPort, ReferenceDataPort, ScheduleRepository, VolunteerDirectory } from '../../application/ports';
import { buildLedger, buildOpeningTimes, buildSubmissions, buildVolunteers, buildWorkspace, LOCATIONS, TEAMS } from './data';

const delay = <T>(value: T, ms: number): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms));

export function createMockReference(latency = MOCK_LATENCY_MS): ReferenceDataPort {
  return {
    load: () =>
      delay(
        {
          festivalId: CURRENT_FESTIVAL,
          locations: LOCATIONS,
          teams: TEAMS,
          openingTimes: buildOpeningTimes(),
          eligibility: ELIGIBILITY_WINDOW,
          feedbackThresholds: FEEDBACK_THRESHOLDS,
        },
        latency,
      ),
  };
}

export interface MockScheduleRepository extends ScheduleRepository {
  /** Inspection hook for tests. */
  readonly savedDrafts: ReadonlyMap<TeamId, EntryMap>;
}

export function createMockSchedules(clock: ClockPort, latency = MOCK_LATENCY_MS): MockScheduleRepository {
  const savedDrafts = new Map<TeamId, EntryMap>();
  return {
    savedDrafts,
    loadWorkspace: () => delay(buildWorkspace(clock.now()), latency),
    loadMassMarks: () => delay(buildLedger(), latency),
    async saveDraft(teamId, entries) {
      savedDrafts.set(teamId, entries);
      return delay({ savedAt: toUtcIso(clock.now()) }, latency);
    },
    async publish(teamIds, choice, entries) {
      if (teamIds.length === 0) return delay({ ok: false, error: 'validation', detail: 'noTeams' } as const, latency);
      if (choice.kind === 'scheduled' && utcMs(choice.at) < clock.now() + MIN_SCHEDULE_LEAD_MS) {
        return delay({ ok: false, error: 'validation', detail: 'tooSoon' } as const, latency);
      }
      for (const id of teamIds) savedDrafts.set(id, entries[id] ?? {});
      const now = toUtcIso(clock.now());
      const status =
        choice.kind === 'now'
          ? ({ kind: 'published', at: now } as const)
          : choice.kind === 'scheduled'
            ? ({ kind: 'scheduled', at: choice.at } as const)
            : ({ kind: 'draft' } as const);
      return delay({ ok: true, status } as const, latency);
    },
  };
}

export function createMockVolunteers(latency = MOCK_LATENCY_MS): VolunteerDirectory {
  const volunteers = buildVolunteers();
  const submissions = buildSubmissions(volunteers);
  return {
    // The backend filters by festival; the mock returns everyone so the client-side filter is exercised too.
    listVolunteers: () => delay(volunteers, latency),
    listSubmissions: () => delay(submissions, latency),
  };
}
