/**
 * Ports (hexagonal architecture). The UI and use-cases depend only on these interfaces;
 * `src/adapters/mock` implements them with dummy data today, an HTTP adapter will later.
 */
import type { FestivalId, LocationId, TeamId } from '../domain/brand';
import type { OpeningTime } from '../domain/legend';
import type { LedgerState } from '../domain/markLedger';
import type { PublishChoice, ScheduleStatus } from '../domain/publish';
import type { EligibilityWindow } from '../domain/schedule';
import type { UtcIso } from '../domain/time';
import type { FeedbackThresholds, Submission, Volunteer } from '../domain/volunteers';
import type { EntryMap, Workspace } from '../domain/workspace';

export interface Location {
  readonly id: LocationId;
  readonly name: string;
}

export interface Team {
  readonly id: TeamId;
  readonly name: string;
}

export interface ReferenceData {
  readonly festivalId: FestivalId;
  readonly locations: readonly Location[];
  readonly teams: readonly Team[];
  /** Entered by the superadmin. */
  readonly openingTimes: readonly OpeningTime[];
  readonly eligibility: EligibilityWindow;
  /** Limits for the live-feedback groups (backend policy). */
  readonly feedbackThresholds: FeedbackThresholds;
}

export interface ReferenceDataPort {
  load(): Promise<ReferenceData>;
}

export interface ScheduleRepository {
  loadWorkspace(festivalId: FestivalId): Promise<Workspace>;
  /** Which earlier mass-overwrite batches marked which days. */
  loadMassMarks(festivalId: FestivalId): Promise<LedgerState>;
  saveDraft(teamId: TeamId, entries: EntryMap): Promise<{ savedAt: UtcIso }>;
  publish(teamIds: readonly TeamId[], choice: PublishChoice, entries: Readonly<Record<TeamId, EntryMap>>): Promise<PublishResult>;
}

export type PublishResult =
  | { readonly ok: true; readonly status: ScheduleStatus }
  | { readonly ok: false; readonly error: 'validation' | 'conflict' | 'network'; readonly detail?: string };

export interface VolunteerDirectory {
  listVolunteers(festivalId: FestivalId): Promise<readonly Volunteer[]>;
  /** Free-time intervals volunteers have already opened. */
  listSubmissions(festivalId: FestivalId): Promise<readonly Submission[]>;
}

export interface ClockPort {
  now(): number;
}

/** Remembers the viewer's own timezone (cookie today) and whether the warning is collapsed. */
export interface TimezonePreferencePort {
  /** Detects the device timezone, stores it, and returns it. */
  rememberDeviceZone(): string;
  storedZone(): string | null;
  isWarningCollapsed(): boolean | null;
  setWarningCollapsed(collapsed: boolean): void;
}

export interface Ports {
  readonly reference: ReferenceDataPort;
  readonly schedules: ScheduleRepository;
  readonly volunteers: VolunteerDirectory;
  readonly clock: ClockPort;
  readonly timezone: TimezonePreferencePort;
}
