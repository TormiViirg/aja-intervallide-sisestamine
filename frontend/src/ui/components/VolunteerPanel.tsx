/**
 * "Tiimi vabatahtlikud" — live feedback on the visible volunteers (filtered by managed team
 * and locations in the UI, by festival internally). Text size steps in 2 pt; smaller text
 * earns more rows per group.
 */
import { type CSSProperties, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FEEDBACK_DEFAULT_PT, FEEDBACK_MAX_PT, FEEDBACK_MIN_PT, rowsForSize, stepFeedbackSize } from '../../domain/feedbackSize';
import { FEEDBACK_GROUPS, type FeedbackGroup, groupVolunteers, sortByName } from '../../domain/volunteers';
import { useApp } from '../AppProvider';
import { ChevronIcon } from '../icons';
import './volunteerPanel.css';

export function VolunteerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { board, data, locale } = useApp();
  const [pt, setPt] = useState(FEEDBACK_DEFAULT_PT);
  const [expanded, setExpanded] = useState<Record<FeedbackGroup, boolean>>({ unfilled: true, tooFew: true, nearLimit: true, unusual: false });
  const [showAll, setShowAll] = useState<Partial<Record<FeedbackGroup, boolean>>>({});

  const groups = useMemo(
    () => groupVolunteers(board.visibleVolunteers, data.submissions, new Set(board.days), data.ref.feedbackThresholds),
    [board.visibleVolunteers, board.days, data.submissions, data.ref.feedbackThresholds],
  );
  if (!open) return null;
  const rows = rowsForSize(pt);

  return (
    <aside id="volunteer-panel" className="vp" style={{ '--fb-pt': pt } as CSSProperties} aria-label={t('volunteers.title')}>
      <button type="button" className="vp__head" aria-expanded onClick={onClose}>
        <span>{t('volunteers.title')}</span>
        <ChevronIcon up className="vp__chev" />
      </button>
      <div className="vp__bar">
        <div className="vp__size" role="group" aria-label={t('volunteers.textSize', { pt })}>
          <button type="button" aria-label={t('volunteers.textSmaller')} disabled={pt <= FEEDBACK_MIN_PT} onClick={() => setPt((p) => stepFeedbackSize(p, -1))}>
            A−
          </button>
          <output className="mono" aria-live="polite" data-testid="feedback-size">
            {t('volunteers.textSize', { pt })}
          </output>
          <button type="button" aria-label={t('volunteers.textLarger')} disabled={pt >= FEEDBACK_MAX_PT} onClick={() => setPt((p) => stepFeedbackSize(p, 1))}>
            A+
          </button>
        </div>
        <span className="vp__count mono" title={t('volunteers.total', { count: board.visibleVolunteers.length })}>
          {board.visibleVolunteers.length}
        </span>
      </div>
      <div className="vp__scroll">
        {FEEDBACK_GROUPS.map((g) => {
          const list = sortByName(groups[g], locale);
          const limit = showAll[g] ? list.length : rows * 2;
          const isOpen = expanded[g];
          return (
            <section key={g} className="vp__group" data-testid={`group-${g}`}>
              <button
                type="button"
                className="vp__group-head"
                aria-expanded={isOpen}
                onClick={() => setExpanded((e) => ({ ...e, [g]: !e[g] }))}
              >
                <span>{t(`volunteers.${g}`)}</span>
                <ChevronIcon up={isOpen} className="vp__chev vp__chev--sm" />
              </button>
              {isOpen ? (
                list.length ? (
                  <ul className="vp__names" style={{ '--rows': Math.min(rows, Math.ceil(Math.min(limit, list.length) / 2)) } as CSSProperties}>
                    {list.slice(0, limit).map((v) => (
                      <li key={v.id} title={v.name}>
                        {v.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="vp__empty">{t('volunteers.empty')}</p>
                )
              ) : null}
              <div className="vp__group-foot">
                {isOpen && list.length > limit ? (
                  <button type="button" className="vp__more" onClick={() => setShowAll((s) => ({ ...s, [g]: true }))}>
                    {t('volunteers.more', { count: list.length - limit })}
                  </button>
                ) : null}
                <span className="vp__count mono" data-testid={`group-count-${g}`}>
                  {list.length}
                </span>
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
