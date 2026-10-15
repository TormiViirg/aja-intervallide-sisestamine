/**
 * Interval selection component — one day's collection window.
 * Every legend rule is a modifier class, so the visual mapping lives in card.css only.
 */
import { memo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Field } from '../../domain/interval';
import { oklchGray } from '../../domain/oklch';
import { type DateKey, formatDayMonth, formatWallTime, type WallTime } from '../../domain/time';
import type { CardModel } from '../../application/selectors';
import { PencilIcon } from '../icons';
import { TimeField } from './TimeField';
import './card.css';

export interface IntervalCardProps {
  card: CardModel;
  paintMode: boolean;
  onSet: (date: DateKey, field: Field, minutes: WallTime | null) => void;
  onRevert: (date: DateKey, field: Field) => void;
  onApplyMass: (date: DateKey) => void;
}

const RECENCY_CLASS = { none: '', day: 'card--day', threeDays: 'card--three', older: 'card--older' } as const;

export const IntervalCard = memo(function IntervalCard({ card, paintMode, onSet, onRevert, onApplyMass }: IntervalCardProps) {
  const { t } = useTranslation();
  const date = formatDayMonth(card.date);
  const weekday = t(`weekday.${card.weekday}` as 'weekday.0');
  const { legend, impact, marks } = card;
  const cls = [
    'card',
    RECENCY_CLASS[legend.recency],
    legend.beforeOpening && 'card--early',
    legend.overnight && 'card--overnight',
    legend.republished && 'card--republished',
    card.problems.length && 'card--problem',
    paintMode && 'card--paint',
    paintMode && card.locked && 'card--locked',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      role="group"
      aria-label={`${weekday} ${date}`}
      data-date={card.date}
      data-testid={`card-${card.date}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (paintMode && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onApplyMass(card.date);
        }
      }}
    >
      {legend.republished ? <span className="card__sheets" aria-hidden /> : null}
      <MassMarks start={marks.start} end={marks.end} />
      <div className="card__open mono" aria-label={t('card.opens')}>
        {card.openings.slice(0, 2).map((o) => (
          <div key={o.location}>
            {formatWallTime(o.time)} <span className="card__loc">{o.location}</span>
          </div>
        ))}
      </div>
      <span className="card__weekday">{weekday}</span>
      <div className="card__date mono">{date}</div>
      <span className="card__early" aria-hidden />
      <TimeField
        field="start"
        className="card__start"
        view={card.start}
        label={t('card.start', { date })}
        revertTo={card.revert.start}
        paintMode={paintMode}
        onCommit={(m) => onSet(card.date, 'start', m)}
        onRevert={() => onRevert(card.date, 'start')}
      />
      <span className="card__dash" aria-hidden />
      <TimeField
        field="end"
        className="card__end"
        view={card.end}
        label={t('card.end', { date })}
        prefix={card.endWeekday !== null ? t(`weekday.${card.endWeekday}` as 'weekday.0') : null}
        revertTo={card.revert.end}
        paintMode={paintMode}
        onCommit={(m) => onSet(card.date, 'end', m)}
        onRevert={() => onRevert(card.date, 'end')}
      />
      <div className="card__foot mono">
        {impact ? (
          <>
            <span title={t('card.affected', { count: impact.affected.length })}>
              {impact.affected.length}
              <PencilIcon className="card__foot-icon" />
            </span>{' '}
            <span title={t('card.notify', { count: impact.notify.length })}>{impact.notify.length}@</span>
            <span className="visually-hidden">
              {t('card.affected', { count: impact.affected.length })}, {t('card.notify', { count: impact.notify.length })}
            </span>
          </>
        ) : (
          <span title={t('card.submitters', { count: card.submitters })}>{card.submitters}</span>
        )}
      </div>
      {card.problems.includes('sameStartEnd') ? (
        <span className="card__problem" role="note">
          {t('card.sameStartEnd')}
        </span>
      ) : null}
    </div>
  );
});

function MassMarks({ start, end }: { start: number | null; end: number | null }) {
  const { t } = useTranslation();
  if (start === null && end === null) return null;
  return (
    <span className="card__marks">
      <span
        className="card__mark card__mark--start"
        style={start !== null ? ({ background: oklchGray(start) } as CSSProperties) : undefined}
        title={start !== null ? t('card.massStart') : undefined}
      />
      <span
        className="card__mark card__mark--end"
        style={end !== null ? ({ background: oklchGray(end) } as CSSProperties) : undefined}
        title={end !== null ? t('card.massEnd') : undefined}
      />
    </span>
  );
}
