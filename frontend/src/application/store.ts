/**
 * Application state: the multi-team workspace, the mass-overwrite colour ledger and the
 * mass panel's settings, composed into one reducer so a mass write and its colour marks
 * can never get out of step.
 */
import type { Field } from '../domain/interval';
import { initialLedger, ledgerReducer, type LedgerState } from '../domain/markLedger';
import type { DateKey, UtcIso, WallTime } from '../domain/time';
import { isLocked, type Workspace, type WorkspaceAction, workspaceReducer } from '../domain/workspace';

export interface MassSettings {
  readonly start: WallTime;
  readonly end: WallTime;
  /** "Ära algust mõjuta" — leave starts alone. */
  readonly keepStart: boolean;
  /** "Ära lõppu mõjuta" — leave ends alone. */
  readonly keepEnd: boolean;
  /** "Kirjutab üle puudutusel" — touching a card writes the mass values. */
  readonly onTouch: boolean;
}

export const DEFAULT_MASS: MassSettings = {
  start: (8 * 60 + 30) as WallTime,
  end: (21 * 60 + 45) as WallTime,
  keepStart: true,
  keepEnd: false,
  onTouch: false,
};

export interface AppState {
  readonly ws: Workspace;
  readonly ledger: LedgerState;
  readonly mass: MassSettings;
}

export type AppAction =
  | WorkspaceAction
  | { type: 'LOAD_ALL'; ws: Workspace; ledger: LedgerState }
  | { type: 'MASS_SET'; patch: Partial<MassSettings> }
  /** `surroundings` = lightness of the colours already on the visible days (for the batch grey). */
  | { type: 'MASS_APPLY'; dates: readonly DateKey[]; surroundings: readonly number[]; now: UtcIso };

export function massFields(m: MassSettings): Field[] {
  const f: Field[] = [];
  if (!m.keepStart) f.push('start');
  if (!m.keepEnd) f.push('end');
  return f;
}

/** Mass settings changes that start a new colour batch (values or affected fields). */
const BATCH_KEYS: ReadonlyArray<keyof MassSettings> = ['start', 'end', 'keepStart', 'keepEnd'];

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_ALL':
      return { ...state, ws: action.ws, ledger: action.ledger };
    case 'MASS_SET': {
      const mass = { ...state.mass, ...action.patch };
      const newBatch = BATCH_KEYS.some((k) => k in action.patch && action.patch[k] !== state.mass[k]);
      return { ...state, mass, ledger: newBatch ? ledgerReducer(state.ledger, { type: 'CLOSE' }) : state.ledger };
    }
    case 'MASS_APPLY': {
      const fields = massFields(state.mass);
      const dates = action.dates.filter((d) => !isLocked(state.ws, d));
      if (!fields.length || !dates.length || !state.ws.selected.length) return state;
      const values = Object.fromEntries(fields.map((f) => [f, state.mass[f]])) as Partial<Record<Field, WallTime>>;
      const ws = workspaceReducer(state.ws, { type: 'APPLY_MASS', dates, values, now: action.now });
      let ledger = ledgerReducer(state.ledger, {
        type: 'OPEN',
        values: { start: values.start ?? null, end: values.end ?? null },
        surroundings: action.surroundings,
      });
      for (const date of dates) ledger = ledgerReducer(ledger, { type: 'MARK', date, fields });
      return { ...state, ws, ledger };
    }
    case 'SET_FIELD':
    case 'REVERT_FIELD':
      // A hand edit replaces whatever the mass tool wrote, so its colour mark goes too.
      return {
        ...state,
        ws: workspaceReducer(state.ws, action),
        ledger: ledgerReducer(state.ledger, { type: 'UNMARK', date: action.date, field: action.field }),
      };
    default:
      return { ...state, ws: workspaceReducer(state.ws, action) };
  }
}

export const emptyWorkspace = (from: DateKey, to: DateKey): Workspace => ({
  teams: {},
  selected: [],
  range: { from, to },
  locationIds: [],
  locks: [],
});

export const initialAppState = (ws: Workspace): AppState => ({ ws, ledger: initialLedger, mass: DEFAULT_MASS });
