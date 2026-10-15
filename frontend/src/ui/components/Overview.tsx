/**
 * Behind "Valikuid kinnitama": what changed, who is affected and who will be notified,
 * warnings to go back and check, and the publish choice (now / scheduled in Estonian time /
 * save progress only).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamId } from '../../domain/brand';
import { type DayEntry, entryWall } from '../../domain/interval';
import { parseScheduledPublish, type PublishChoice, type ScheduleProblem } from '../../domain/publish';
import { addDays, type DateKey, formatDayMonth, formatWallTime, tallinnDateOf, utcToWall, wallToUtc } from '../../domain/time';
import { buildOverview } from '../../application/selectors';
import { useApp, useWorkflowState } from '../AppProvider';
import { ArrowIcon } from '../icons';
import './overview.css';

type Mode = PublishChoice['kind'];

function fmtEntry(date: DateKey, e: DayEntry, empty: string): string {
  const w = entryWall(date, e);
  const s = w.start === null ? empty : formatWallTime(w.start);
  const en = w.end === null ? empty : formatWallTime(w.end) + (w.endDayOffset ? ' +1' : '');
  return `${s} – ${en}`;
}

export function Overview() {
  const { t } = useTranslation();
  const { state, data, workflow, dispatch, ports } = useApp();
  const wf = useWorkflowState();
  const model = useMemo(() => buildOverview(state, data.ref, data.volunteers, data.submissions), [state, data]);
  const teamName = (id: TeamId) => data.ref.teams.find((x) => x.id === id)?.name ?? id;

  const nowMs = ports.clock.now();
  const today = tallinnDateOf(nowMs);
  const [mode, setMode] = useState<Mode>('now');
  const [date, setDate] = useState<string>(addDays(today, 1));
  const [time, setTime] = useState('09:00');
  const [problems, setProblems] = useState<readonly ScheduleProblem[]>([]);
  const collectionEnd = wallToUtc(addDays(state.ws.range.to, 1), 0);
  const submitting = wf.value === 'submitting';

  const submit = () => {
    if (mode === 'scheduled') {
      const r = parseScheduledPublish(date, time, ports.clock.now(), collectionEnd);
      if (!r.ok) {
        setProblems(r.problems);
        return;
      }
      setProblems([]);
      workflow.send({ type: 'SUBMIT', choice: { kind: 'scheduled', at: r.at } });
      return;
    }
    setProblems([]);
    workflow.send({ type: 'SUBMIT', choice: { kind: mode } as PublishChoice });
  };

  const review = (id: TeamId) => {
    workflow.send({ type: 'BACK' });
    dispatch({ type: 'SELECT_TEAMS', teamIds: [id] });
  };

  const warnings = model.teams.flatMap((team) => {
    const out: Array<{ key: string; text: string; review?: TeamId }> = [];
    if (team.unreviewedJointEdits > 0)
      out.push({ key: `j-${team.teamId}`, text: t('overview.warnUnreviewed', { team: teamName(team.teamId), count: team.unreviewedJointEdits }), review: team.teamId });
    if (team.beforeOpeningDays > 0) out.push({ key: `b-${team.teamId}`, text: `${teamName(team.teamId)}: ${t('overview.warnBeforeOpening', { count: team.beforeOpeningDays })}` });
    if (team.incompleteDays > 0) out.push({ key: `i-${team.teamId}`, text: `${teamName(team.teamId)}: ${t('overview.warnIncomplete', { count: team.incompleteDays })}` });
    return out;
  });
  for (const id of model.parked) warnings.push({ key: `p-${id}`, text: t('overview.warnParked', { team: teamName(id) }), review: id });

  return (
    <main className="ov" aria-labelledby="ov-title">
      <div className="ov__top">
        <button type="button" className="ov__back" onClick={() => workflow.send({ type: 'BACK' })}>
          <ArrowIcon left /> {t('overview.back')}
        </button>
        <h1 id="ov-title" className="ov__title">
          {t('overview.title')}
        </h1>
      </div>

      {warnings.length ? (
        <section className="ov__warnings" aria-labelledby="ov-warn" data-testid="overview-warnings">
          <h2 id="ov-warn">{t('overview.warningsTitle')}</h2>
          <ul>
            {warnings.map((w) => (
              <li key={w.key}>
                <span>{w.text}</span>
                {w.review ? (
                  <button type="button" className="ov__link" onClick={() => review(w.review as TeamId)}>
                    {t('overview.reviewTeam', { team: teamName(w.review) })}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {model.teams.map((team) => (
        <section key={team.teamId} className="ov__team" aria-label={teamName(team.teamId)}>
          <h2 className="ov__team-name">{t('overview.teamHeading', { team: teamName(team.teamId) })}</h2>
          <div className="ov__cols">
            <div>
              <h3>{t('overview.changes')}</h3>
              {team.changes.length ? (
                <table className="ov__table">
                  <thead>
                    <tr>
                      <th scope="col" />
                      <th scope="col">{t('overview.before')}</th>
                      <th scope="col">{t('overview.after')}</th>
                      <th scope="col" className="ov__num">
                        ✎
                      </th>
                      <th scope="col" className="ov__num">
                        @
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.changes.map((c) => (
                      <tr key={c.date}>
                        <th scope="row" className="mono">
                          {formatDayMonth(c.date)}
                        </th>
                        <td className="mono">{c.before ? fmtEntry(c.date, c.before, 'XX:XX') : '—'}</td>
                        <td className="mono">{fmtEntry(c.date, c.after, 'XX:XX')}</td>
                        <td className="mono ov__num">{c.impact.affected.length}</td>
                        <td className="mono ov__num">{c.impact.notify.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="ov__muted">{t('overview.noChanges')}</p>
              )}
            </div>
            <div>
              <h3>{t('overview.affectedTitle')}</h3>
              <p className="ov__summary" data-testid={`impact-${team.teamId}`}>
                {t('overview.affectedCount', { affected: team.affected.length, notify: team.notify.length })}
              </p>
              {team.affected.length ? (
                <ul className="ov__names">
                  {team.affected.map((id) => (
                    <li key={id} className={team.notify.includes(id) ? 'ov__notify' : undefined}>
                      {model.names.get(id) ?? id}
                      {team.notify.includes(id) ? <span className="ov__tag">{t('overview.notifyMark')}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ov__muted">{t('overview.nobodyAffected')}</p>
              )}
            </div>
          </div>
        </section>
      ))}

      <section className="ov__publish" aria-labelledby="ov-pub">
        <h2 id="ov-pub">{t('overview.publishTitle')}</h2>
        <div role="radiogroup" className="ov__modes">
          {(['now', 'scheduled', 'draft'] as const).map((m) => (
            <label key={m} className="ov__mode">
              <input type="radio" name="publish-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              <span>{t(m === 'now' ? 'overview.publishNow' : m === 'scheduled' ? 'overview.publishScheduled' : 'overview.saveOnly')}</span>
            </label>
          ))}
        </div>
        {mode === 'scheduled' ? (
          <div className="ov__when">
            <label>
              <span>{t('overview.date')}</span>
              <input
                type="date"
                className="mono"
                value={date}
                min={today}
                max={state.ws.range.to}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={problems.includes('invalidDate')}
              />
            </label>
            <label>
              <span>{t('overview.time')}</span>
              <input
                className="mono"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-invalid={problems.includes('invalidTime')}
              />
            </label>
            <span className="ov__muted mono">
              {formatWallTime(utcToWall(nowMs).minutes)} {formatDayMonth(tallinnDateOf(nowMs))} → Europe/Tallinn
            </span>
          </div>
        ) : null}
        {problems.length ? (
          <ul className="ov__errors" role="alert">
            {problems.map((p) => (
              <li key={p}>{t(`overview.${p}`)}</li>
            ))}
          </ul>
        ) : null}
        {wf.error ? (
          <p className="ov__errors" role="alert">
            {t(wf.error === 'validation' ? 'overview.errorValidation' : wf.error === 'conflict' ? 'overview.errorConflict' : 'overview.errorNetwork')}
          </p>
        ) : null}
        <button type="button" className="fbtn fbtn--ink ov__submit" onClick={submit} disabled={submitting}>
          {submitting
            ? t('overview.submitting')
            : t(mode === 'now' ? 'overview.submitNow' : mode === 'scheduled' ? 'overview.submitScheduled' : 'overview.submitDraft')}
          <ArrowIcon className="fbtn__arrow" />
        </button>
      </section>
    </main>
  );
}
