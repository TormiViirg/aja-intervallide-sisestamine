/**
 * Two calendars: the left one picks the start, the right one the end. The library supplies
 * behaviour and accessibility only — every class is replaced (`classNames`) and its stylesheet
 * is never imported, so the look comes entirely from rangePicker.css.
 */
import { type ClassNames, DayPicker, type Matcher } from '@daypicker/react';
import { enGB, et as etLocale, ru as ruLocale } from '@daypicker/react/locale';
import { shallowEqual, useActorRef, useSelector } from '@xstate/react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { rangePickerMachine } from '../../application/machines/rangePickerMachine';
import { isDayEligible } from '../../domain/schedule';
import { daysBetween, type DateKey, dateKeyToLocalDate, formatFullDate, localDateToDateKey, tallinnDateOf, utcMs, addDays } from '../../domain/time';
import { useApp } from '../AppProvider';
import { ChevronIcon } from '../icons';
import './rangePicker.css';

const LOCALES = { et: etLocale, en: enGB, ru: ruLocale } as const;

const CLASSES: Partial<ClassNames> = {
  root: 'cal',
  months: 'cal__months',
  month: 'cal__month',
  month_caption: 'cal__caption',
  caption_label: 'cal__caption-label',
  nav: 'cal__nav',
  button_previous: 'cal__nav-btn',
  button_next: 'cal__nav-btn',
  chevron: 'cal__chevron',
  month_grid: 'cal__grid',
  weekdays: 'cal__weekdays',
  weekday: 'cal__weekday',
  weeks: 'cal__weeks',
  week: 'cal__week',
  day: 'cal__day',
  day_button: 'cal__day-btn',
  selected: 'cal__day--selected',
  disabled: 'cal__day--disabled',
  outside: 'cal__day--outside',
  today: 'cal__day--today',
  hidden: 'cal__day--hidden',
  focused: 'cal__day--focused',
};

export function RangePicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch, data, language } = useApp();
  const eligibility = data.ref.eligibility;
  const actor = useActorRef(rangePickerMachine, { input: { eligibility } });
  const { from, to } = useSelector(actor, (s) => ({ from: s.context.from, to: s.context.to }), shallowEqual);
  const canApply = useSelector(actor, (s) => s.can({ type: 'APPLY' }));

  useEffect(() => {
    actor.send({ type: 'OPEN', range: state.ws.range });
    const sub = actor.on('applied', ({ range }) => {
      dispatch({ type: 'SET_RANGE', range });
      onClose();
    });
    return () => sub.unsubscribe();
    // Opened once per mount; the machine owns the draft from here.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bounds = useMemo(() => {
    const first = tallinnDateOf(utcMs(eligibility.fromUtc));
    const last = addDays(tallinnDateOf(utcMs(eligibility.untilUtc)), -1);
    return { first: dateKeyToLocalDate(first), last: dateKeyToLocalDate(last) };
  }, [eligibility]);

  const notEligible = (d: Date) => !isDayEligible(localDateToDateKey(d), eligibility);
  const beforeStart = (d: Date) => from !== null && localDateToDateKey(d) < from;
  const modifiers: Record<string, Matcher | Matcher[]> = {
    inRange: (d: Date) => from !== null && to !== null && localDateToDateKey(d) >= from && localDateToDateKey(d) <= to,
    rangeStart: (d: Date) => localDateToDateKey(d) === from,
    rangeEnd: (d: Date) => localDateToDateKey(d) === to,
  };
  const shared = {
    locale: LOCALES[language],
    weekStartsOn: 1 as const,
    classNames: CLASSES,
    modifiers,
    modifiersClassNames: { inRange: 'cal__day--in-range', rangeStart: 'cal__day--start', rangeEnd: 'cal__day--end' },
    startMonth: bounds.first,
    endMonth: bounds.last,
    showOutsideDays: true,
    fixedWeeks: true,
    labels: {
      labelPrevious: () => t('range.previousMonth'),
      labelNext: () => t('range.nextMonth'),
    },
    components: {
      Chevron: ({ orientation }: { orientation?: 'up' | 'down' | 'left' | 'right' }) => (
        <ChevronIcon className="cal__chevron" style={{ transform: `rotate(${orientation === 'left' ? 90 : -90}deg)` }} />
      ),
    },
  };
  const pick = (type: 'PICK_START' | 'PICK_END') => (d: Date | undefined) => d && actor.send({ type, date: localDateToDateKey(d) });
  const toDate = (k: DateKey | null) => (k ? dateKeyToLocalDate(k) : undefined);

  return (
    <div className="rp" role="dialog" aria-label={t('range.label')}>
      <div className="rp__calendars">
        <section className="rp__side" aria-label={t('range.start')}>
          <h3 className="rp__heading">
            {t('range.start')}
            <span className="rp__picked mono">{from ? formatFullDate(from) : '—'}</span>
          </h3>
          <DayPicker
            {...shared}
            mode="single"
            required
            selected={toDate(from)}
            onSelect={pick('PICK_START')}
            disabled={notEligible}
            defaultMonth={dateKeyToLocalDate(state.ws.range.from)}
          />
        </section>
        <section className="rp__side" aria-label={t('range.end')}>
          <h3 className="rp__heading">
            {t('range.end')}
            <span className="rp__picked mono">{to ? formatFullDate(to) : t('range.pickEnd')}</span>
          </h3>
          <DayPicker
            {...shared}
            mode="single"
            required
            selected={toDate(to)}
            onSelect={pick('PICK_END')}
            disabled={[notEligible, beforeStart]}
            defaultMonth={dateKeyToLocalDate(state.ws.range.to)}
          />
        </section>
      </div>
      <div className="rp__footer">
        <span className="rp__count mono">
          {from && to && to >= from ? t('range.days', { count: daysBetween(from, to) + 1 }) : ''}
        </span>
        <button type="button" className="btn btn--ghost" onClick={() => { actor.send({ type: 'CANCEL' }); onClose(); }}>
          {t('range.cancel')}
        </button>
        <button type="button" className="btn btn--ink" disabled={!canApply} onClick={() => actor.send({ type: 'APPLY' })}>
          {t('range.apply')}
        </button>
      </div>
    </div>
  );
}
