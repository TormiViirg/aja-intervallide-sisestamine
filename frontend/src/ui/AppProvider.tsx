/**
 * Composition root for React: loads through the ports, owns the reducer and the workflow
 * machine, and exposes derived view-models. Components never import adapters.
 */
import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { fromPromise } from 'xstate';
import type { TeamId } from '../domain/brand';
import type { PublishChoice } from '../domain/publish';
import { toDateKey, toUtcIso, type UtcIso } from '../domain/time';
import type { Submission, Volunteer } from '../domain/volunteers';
import { selectedTeams } from '../domain/workspace';
import { workflowMachine } from '../application/machines/workflowMachine';
import type { Ports, PublishResult, ReferenceData } from '../application/ports';
import { type BoardModel, buildBoard } from '../application/selectors';
import { type AppAction, appReducer, type AppState, emptyWorkspace, initialAppState } from '../application/store';
import { createI18n, INTL_LOCALE, isLanguage, type Language } from '../i18n';

interface Loaded {
  readonly ref: ReferenceData;
  readonly volunteers: readonly Volunteer[];
  readonly submissions: readonly Submission[];
}

interface Toast {
  readonly id: number;
  readonly text: string;
}

export interface AppContextValue {
  readonly ports: Ports;
  readonly state: AppState;
  readonly dispatch: (a: AppAction) => void;
  readonly data: Loaded;
  readonly board: BoardModel;
  readonly nowIso: () => UtcIso;
  readonly language: Language;
  readonly locale: string;
  readonly setLanguage: (l: Language) => void;
  readonly toast: (text: string) => void;
  readonly toasts: readonly Toast[];
  readonly workflow: ReturnType<typeof useActorRef<typeof workflowMachine>>;
  readonly saving: boolean;
  readonly saveDraft: (teamIds?: readonly TeamId[]) => Promise<void>;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

const LANGUAGE_KEY = 'poff.language';

function initialLanguage(): Language {
  const fromQuery = new URLSearchParams(window.location.search).get('lng');
  if (isLanguage(fromQuery)) return fromQuery;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* storage unavailable — fall back to Estonian */
  }
  return 'et';
}

export function AppProvider({ ports, children, fallback }: { ports: Ports; children: ReactNode; fallback?: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const i18n = useMemo(() => createI18n(language), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [data, setData] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [state, dispatch] = useReducer(appReducer, undefined, () =>
    initialAppState(emptyWorkspace(toDateKey('2026-10-26'), toDateKey('2026-11-24'))),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);
  const toastId = useRef(0);

  const setLanguage = useCallback(
    (l: Language) => {
      setLanguageState(l);
      void i18n.changeLanguage(l);
      document.documentElement.lang = l;
      try {
        window.localStorage.setItem(LANGUAGE_KEY, l);
      } catch {
        /* ignore */
      }
    },
    [i18n],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    (async () => {
      const ref = await ports.reference.load();
      const [ws, ledger, volunteers, submissions] = await Promise.all([
        ports.schedules.loadWorkspace(ref.festivalId),
        ports.schedules.loadMassMarks(ref.festivalId),
        ports.volunteers.listVolunteers(ref.festivalId),
        ports.volunteers.listSubmissions(ref.festivalId),
      ]);
      if (cancelled) return;
      dispatch({ type: 'LOAD_ALL', ws, ledger });
      setData({ ref, volunteers, submissions });
    })().catch(() => {
      if (!cancelled) setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ports]);

  const nowIso = useCallback(() => toUtcIso(ports.clock.now()), [ports]);

  // The submit actor closes over the latest state through a ref.
  const stateRef = useRef(state);
  stateRef.current = state;
  const workflow = useActorRef(
    workflowMachine.provide({
      actors: {
        submit: fromPromise<PublishResult, { choice: PublishChoice }>(async ({ input }) => {
          const s = stateRef.current;
          const teams = selectedTeams(s.ws);
          return ports.schedules.publish(
            teams.map((t) => t.teamId),
            input.choice,
            Object.fromEntries(teams.map((t) => [t.teamId, t.entries])),
          );
        }),
      },
    }),
  );

  useEffect(() => {
    const sub = workflow.on('submitted', ({ choice, result }) => {
      const ids = stateRef.current.ws.selected;
      if (choice.kind === 'draft') dispatch({ type: 'MARK_SAVED', teamIds: ids });
      else dispatch({ type: 'MARK_PUBLISHED', teamIds: ids, status: result.status });
      const tr = i18n.t.bind(i18n);
      toast(
        choice.kind === 'now'
          ? tr('toast.published')
          : choice.kind === 'scheduled'
            ? tr('toast.scheduled', { when: new Intl.DateTimeFormat(INTL_LOCALE[i18n.language as Language] ?? 'et-EE', { timeZone: 'Europe/Tallinn', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(choice.at)) })
            : tr('toast.draftSaved'),
      );
    });
    return () => sub.unsubscribe();
  }, [workflow, i18n, toast]);

  const saveDraft = useCallback(
    async (teamIds?: readonly TeamId[]) => {
      const s = stateRef.current;
      const ids = teamIds ?? s.ws.selected;
      setSaving(true);
      try {
        await Promise.all(ids.map((id) => ports.schedules.saveDraft(id, s.ws.teams[id]?.entries ?? {})));
        dispatch({ type: 'MARK_SAVED', teamIds: ids });
      } finally {
        setSaving(false);
      }
    },
    [ports],
  );

  const board = useMemo(
    () => (data ? buildBoard(state, data.ref, data.volunteers, data.submissions, ports.clock.now()) : null),
    [state, data, ports],
  );

  const value = useMemo<AppContextValue | null>(
    () =>
      data && board
        ? {
            ports,
            state,
            dispatch,
            data,
            board,
            nowIso,
            language,
            locale: INTL_LOCALE[language],
            setLanguage,
            toast,
            toasts,
            workflow,
            saving,
            saveDraft,
          }
        : null,
    [ports, state, data, board, nowIso, language, setLanguage, toast, toasts, workflow, saving, saveDraft],
  );

  return (
    <I18nextProvider i18n={i18n}>
      {value ? <Ctx.Provider value={value}>{children}</Ctx.Provider> : loadFailed ? <LoadError /> : fallback}
    </I18nextProvider>
  );
}

function LoadError() {
  const { t } = useTranslation();
  return (
    <p role="alert" className="loading">
      {t('loadError')}{' '}
      <button type="button" className="btn" onClick={() => window.location.reload()}>
        {t('reload')}
      </button>
    </p>
  );
}

export function useWorkflowState() {
  const { workflow } = useApp();
  return useSelector(
    workflow,
    (s) => ({ value: s.value as 'editing' | 'overview' | 'submitting', error: s.context.error }),
    shallowEqual,
  );
}
