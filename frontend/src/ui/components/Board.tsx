/**
 * The weekday × week grid of interval cards, the column locks ("tablock"), the weekly totals,
 * and the touch-overwrite gesture (driven by paintMachine).
 */
import { useActorRef } from '@xstate/react';
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Field } from '../../domain/interval';
import { splitMinutes } from '../../domain/schedule';
import { type DateKey, formatDayMonth, type WallTime } from '../../domain/time';
import { paintMachine } from '../../application/machines/paintMachine';
import { useApp } from '../AppProvider';
import { LockIcon } from '../icons';
import { IntervalCard } from './IntervalCard';
import './board.css';

function dateAt(x: number, y: number): DateKey | null {
  if (typeof document.elementFromPoint !== 'function') return null; // not available in jsdom
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]');
  return (el?.dataset.date as DateKey | undefined) ?? null;
}

export function Board() {
  const { t } = useTranslation();
  const { state, dispatch, board, nowIso } = useApp();
  const paintMode = state.mass.onTouch;
  const actor = useActorRef(paintMachine);
  const latest = useRef(board);
  latest.current = board;

  const apply = useCallback(
    (dates: readonly DateKey[]) =>
      dispatch({ type: 'MASS_APPLY', dates, surroundings: latest.current.surroundings, now: nowIso() }),
    [dispatch, nowIso],
  );

  useEffect(() => {
    const subs = [
      actor.on('paint', ({ date }) => apply([date])),
      actor.on('fillAll', () => apply(latest.current.days)),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [actor, apply]);

  // Leaving paint mode mid-stroke must not leave the machine pressed.
  useEffect(() => {
    if (!paintMode) actor.send({ type: 'CANCEL' });
  }, [paintMode, actor]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!paintMode || e.button !== 0) return;
    const date = dateAt(e.clientX, e.clientY);
    if (!date) return;
    // Touch pointers are implicitly captured by the first element; release so moves hit-test freely.
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    actor.send({ type: 'DOWN', date });
    const move = (ev: PointerEvent) => {
      const d = dateAt(ev.clientX, ev.clientY);
      if (d) actor.send({ type: 'ENTER', date: d });
    };
    const up = () => {
      actor.send({ type: 'UP' });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onSet = useCallback(
    (date: DateKey, field: Field, minutes: WallTime | null) => dispatch({ type: 'SET_FIELD', date, field, minutes, now: nowIso() }),
    [dispatch, nowIso],
  );
  const onRevert = useCallback(
    (date: DateKey, field: Field) => dispatch({ type: 'REVERT_FIELD', date, field, now: nowIso() }),
    [dispatch, nowIso],
  );
  const onApplyOne = useCallback((date: DateKey) => apply([date]), [apply]);

  return (
    <section
      className={`board ${paintMode ? 'board--paint' : ''}`}
      aria-label={t('range.label')}
      onPointerDown={onPointerDown}
    >
      <div className="board__heads" role="presentation">
        {board.columns.map((wd, i) => {
          const locked = state.ws.locks.includes(wd);
          const name = t(`weekday.${wd}` as 'weekday.0');
          const columnDays = board.days.filter((d) => board.cards.get(d)?.weekday === wd);
          return (
            <div key={wd} className={`dh ${locked ? 'dh--locked' : ''}`} style={{ gridColumn: i + 1 }}>
              {paintMode && !locked ? (
                <button type="button" className="dh__name" aria-label={t('day.applyColumn', { day: name })} onClick={() => apply(columnDays)}>
                  {name}
                </button>
              ) : (
                <span className="dh__name">{name}</span>
              )}
              <button
                type="button"
                className="dh__lock"
                aria-pressed={locked}
                aria-label={t(locked ? 'day.unlock' : 'day.lock', { day: name })}
                title={t(locked ? 'day.unlock' : 'day.lock', { day: name })}
                onClick={() => dispatch({ type: 'TOGGLE_LOCK', weekday: wd })}
              >
                <LockIcon open={!locked} />
              </button>
            </div>
          );
        })}
      </div>

      {board.days.length === 0 ? <p className="board__empty">{t('board.empty')}</p> : null}
      {board.weeks.map((week) => {
        const total = splitMinutes(board.weekTotals.get(week.monday) ?? 0);
        const days = [...week.byWeekday.values()];
        // A partial week ends its row right after the last card (design: 24.11 → "09t 00min").
        const lastCol = Math.max(...board.columns.map((wd, i) => (week.byWeekday.has(wd) ? i : -1)));
        return (
          <div key={week.monday} className="week" role="group" aria-label={`${formatDayMonth(days[0] ?? week.monday)} – ${formatDayMonth(days.at(-1) ?? week.monday)}`}>
            <div className="week__head">
              <span className="mono">
                {formatDayMonth(days[0] ?? week.monday)} – {formatDayMonth(days.at(-1) ?? week.monday)}
              </span>
            </div>
            {board.columns.map((wd, i) => {
              const date = week.byWeekday.get(wd);
              const card = date ? board.cards.get(date) : undefined;
              return card ? (
                <div key={wd} className="week__cell" style={{ gridColumn: i + 1 }}>
                  <IntervalCard card={card} paintMode={paintMode} onSet={onSet} onRevert={onRevert} onApplyMass={onApplyOne} />
                </div>
              ) : null;
            })}
            <div
              className="week__total mono"
              style={{ '--last-col': lastCol } as CSSProperties}
              aria-label={t('week.totalLabel', total)} data-testid={`week-total-${week.monday}`}>
              {t('week.total', { hours: String(total.hours).padStart(2, '0'), minutes: String(total.minutes).padStart(2, '0') })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
