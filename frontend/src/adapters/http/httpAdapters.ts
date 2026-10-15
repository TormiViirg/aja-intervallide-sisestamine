/**
 * Port implementations backed by the Express API (backend/src/app.js). Whether the backend
 * stores data in memory or Supabase is invisible here — that is the backend's own adapter.
 *
 * Gaps in the current API, handled on this side without backend changes:
 *  - no endpoint returns the published version or status → schedules load as drafts
 *  - no change timestamps → no 24 h / 72 h colouring for loaded days
 *  - mass-overwrite marks are not stored → they last for the session
 */
import { API_FESTIVAL } from '../../config/runtime';
import type { FestivalId, TeamId } from '../../domain/brand';
import { initialLedger } from '../../domain/markLedger';
import type { ScheduleStatus } from '../../domain/publish';
import { toDateKey, toUtcIso, type UtcIso } from '../../domain/time';
import type { EntryMap, TeamSchedule, Workspace } from '../../domain/workspace';
import type { ClockPort, PublishResult, ReferenceData, ReferenceDataPort, ScheduleRepository, VolunteerDirectory } from '../../application/ports';
import { FEEDBACK_THRESHOLDS } from '../../config/runtime';
import { ApiError, type ApiClient } from './apiClient';
import {
  type ConfigDto,
  eligibilityFromRange,
  entriesFromValues,
  locationsFromConfig,
  openingTimesFromConfig,
  type PreviewResponseDto,
  type PublishResponseDto,
  tallinnLocalStamp,
  type TeamDto,
  type ValuesDto,
  valuesFromEntries,
  volunteersFromDtos,
  submissionsFromDtos,
  type VolunteerDto,
} from './backendMapping';

const enc = encodeURIComponent;

/** Config and teams are read by several ports; fetch them once per page load. */
function shared(api: ApiClient) {
  let config: Promise<ConfigDto> | null = null;
  let teams: Promise<TeamDto[]> | null = null;
  return {
    config: () => (config ??= api.get<ConfigDto>('/api/config')),
    teams: () => (teams ??= api.get<TeamDto[]>('/api/teams')),
  };
}

export interface HttpPorts {
  reference: ReferenceDataPort;
  schedules: ScheduleRepository;
  volunteers: VolunteerDirectory;
}

export function createHttpPorts(api: ApiClient, clock: ClockPort): HttpPorts {
  const cache = shared(api);
  const festival = API_FESTIVAL as FestivalId;

  const reference: ReferenceDataPort = {
    async load(): Promise<ReferenceData> {
      const [cfg, teams] = await Promise.all([cache.config(), cache.teams()]);
      return {
        festivalId: festival,
        locations: locationsFromConfig(cfg).map((name) => ({ id: name as ReferenceData['locations'][number]['id'], name })),
        teams: teams.map((t) => ({ id: t.id as TeamId, name: t.name })),
        openingTimes: openingTimesFromConfig(cfg),
        eligibility: eligibilityFromRange(cfg.allowedRange),
        feedbackThresholds: FEEDBACK_THRESHOLDS,
      };
    },
  };

  /** Last values the server is known to hold per team, so cleared days are sent as cleared. */
  const serverState = new Map<TeamId, EntryMap>();

  const schedules: ScheduleRepository = {
    async loadWorkspace(): Promise<Workspace> {
      const [cfg, teams] = await Promise.all([cache.config(), cache.teams()]);
      const drafts = await Promise.all(teams.map((t) => api.get<ValuesDto>(`/api/teams/${enc(t.id)}/draft`)));
      const schedulesById: Record<TeamId, TeamSchedule> = {};
      teams.forEach((t, i) => {
        const id = t.id as TeamId;
        const entries = entriesFromValues(drafts[i] ?? {});
        serverState.set(id, entries);
        schedulesById[id] = {
          teamId: id,
          entries,
          saved: entries,
          published: null,
          changedAt: {},
          status: { kind: 'draft' },
          jointEditsUnreviewed: 0,
        };
      });
      return {
        teams: schedulesById,
        selected: teams[0] ? [teams[0].id as TeamId] : [],
        range: { from: toDateKey(cfg.allowedRange.from), to: toDateKey(cfg.allowedRange.to) },
        locationIds: locationsFromConfig(cfg) as Workspace['locationIds'][number][],
        locks: [],
      };
    },

    loadMassMarks: async () => initialLedger,

    async saveDraft(teamId, entries) {
      const cfg = await cache.config();
      await api.send('PUT', `/api/teams/${enc(teamId)}/draft`, valuesFromEntries(entries, cfg.allowedRange, serverState.get(teamId)));
      serverState.set(teamId, entries);
      return { savedAt: toUtcIso(clock.now()) };
    },

    async publish(teamIds, choice, entriesByTeam): Promise<PublishResult> {
      const cfg = await cache.config();
      let status: ScheduleStatus = { kind: 'draft' };
      for (const teamId of teamIds) {
        const entries = entriesByTeam[teamId] ?? {};
        const body = {
          mode: choice.kind,
          values: valuesFromEntries(entries, cfg.allowedRange, serverState.get(teamId)),
          ...(choice.kind === 'scheduled' ? { at: tallinnLocalStamp(choice.at) } : {}),
        };
        try {
          const res = await api.send<PublishResponseDto>('POST', `/api/teams/${enc(teamId)}/publish`, body);
          serverState.set(teamId, entries);
          status =
            res.status === 'draft'
              ? { kind: 'draft' }
              : { kind: res.status, at: (res.publishAt ?? toUtcIso(clock.now())) as UtcIso };
        } catch (e) {
          if (e instanceof ApiError && e.status === 422) {
            return { ok: false, error: 'validation', detail: JSON.stringify((e.body as { errors?: unknown })?.errors ?? []) };
          }
          if (e instanceof ApiError) return { ok: false, error: 'network', detail: `HTTP ${e.status}` };
          throw e;
        }
      }
      return { ok: true, status };
    },

    async previewImpact(teamId, edits, locationIds) {
      const cfg = await cache.config();
      try {
        const res = await api.send<PreviewResponseDto>('POST', `/api/teams/${enc(teamId)}/preview`, {
          values: valuesFromEntries(edits, cfg.allowedRange),
          locations: locationIds,
        });
        return { affected: res.affected, notify: res.toNotify };
      } catch (e) {
        // Incomplete days fail validation; the overview then falls back to its own calculation.
        if (e instanceof ApiError && e.status === 422) return null;
        throw e;
      }
    },
  };

  let volunteerData: Promise<{ volunteers: VolunteerDto[][]; teams: TeamDto[] }> | null = null;
  const loadVolunteers = () =>
    (volunteerData ??= cache.teams().then(async (teams) => ({
      teams,
      // The API filters by one team at a time; ask for every team and merge.
      volunteers: await Promise.all(teams.map((t) => api.get<VolunteerDto[]>(`/api/volunteers?festival=${enc(festival)}&team=${enc(t.id)}`))),
    })));

  const volunteers: VolunteerDirectory = {
    async listVolunteers(festivalId) {
      const { teams, volunteers: lists } = await loadVolunteers();
      return volunteersFromDtos(
        teams.map((t, i) => [t.id as TeamId, lists[i] ?? []] as const),
        festivalId,
      );
    },
    async listSubmissions() {
      const { volunteers: lists } = await loadVolunteers();
      return submissionsFromDtos(lists.flat());
    },
  };

  return { reference, schedules, volunteers };
}
