import { type CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { oklchGray } from '../../domain/oklch';
import { isDirty, selectedTeams } from '../../domain/workspace';
import { useApp } from '../AppProvider';
import { ArrowIcon, FloppyIcon, LockIcon } from '../icons';
import { TimeField } from './TimeField';
import './footer.css';

export function Switch({ checked, onChange, label, size = 'sm' }: { checked: boolean; onChange: (v: boolean) => void; label: string; size?: 'sm' | 'lg' }) {
  return (
    <label className={`sw sw--${size}`}>
      <span className="sw__label">{label}</span>
      <button type="button" role="switch" aria-checked={checked} className="sw__track" onClick={() => onChange(!checked)}>
        <span className="sw__thumb" />
      </button>
    </label>
  );
}

export function MassPanel({ withLocks = false }: { withLocks?: boolean }) {
  const { t } = useTranslation();
  const { state, dispatch, board } = useApp();
  const m = state.mass;
  const set = (patch: Partial<typeof m>) => dispatch({ type: 'MASS_SET', patch });
  return (
    <div className="mass" style={{ '--batch': oklchGray(board.nextBatchLightness) } as CSSProperties} data-testid="mass-panel">
      <h2 className="mass__title">{t('mass.title')}</h2>
      <div className="mass__toggles">
        <Switch label={t('mass.keepStart')} checked={m.keepStart} onChange={(v) => set({ keepStart: v })} />
        <Switch label={t('mass.keepEnd')} checked={m.keepEnd} onChange={(v) => set({ keepEnd: v })} />
      </div>
      <div className="mass__times">
        <TimeField
          field="start"
          className={m.keepStart ? 'mass__time mass__time--off' : 'mass__time'}
          view={{ kind: 'value', minutes: m.start }}
          label={t('mass.start')}
          revertTo={null}
          paintMode={false}
          onCommit={(v) => v !== null && set({ start: v })}
          onRevert={() => undefined}
        />
        <TimeField
          field="end"
          className={m.keepEnd ? 'mass__time mass__time--off' : 'mass__time'}
          view={{ kind: 'value', minutes: m.end }}
          label={t('mass.end')}
          revertTo={null}
          paintMode={false}
          onCommit={(v) => v !== null && set({ end: v })}
          onRevert={() => undefined}
        />
      </div>
      <Switch size="lg" label={t('mass.onTouch')} checked={m.onTouch} onChange={(v) => set({ onTouch: v })} />
      {m.onTouch ? <p className="mass__hint">{t('mass.onTouchHint')}</p> : null}
      {withLocks ? <LockChips /> : null}
    </div>
  );
}

function LockChips() {
  const { t } = useTranslation();
  const { state, dispatch, board } = useApp();
  return (
    <fieldset className="locks">
      <legend>{t('mass.locks')}</legend>
      {board.columns.map((wd) => {
        const locked = state.ws.locks.includes(wd);
        const name = t(`weekday.${wd}` as 'weekday.0');
        return (
          <button
            key={wd}
            type="button"
            aria-pressed={locked}
            className="locks__chip"
            onClick={() => dispatch({ type: 'TOGGLE_LOCK', weekday: wd })}
            aria-label={t(locked ? 'day.unlock' : 'day.lock', { day: name })}
          >
            <LockIcon open={!locked} />
            {name.slice(0, 2)}
          </button>
        );
      })}
    </fieldset>
  );
}

export function Legend() {
  const { t } = useTranslation();
  const items = [
    ['republished', 'lg-ico--stack'],
    ['day', 'lg-ico--day'],
    ['beforeOpening', 'lg-ico--early'],
    ['threeDays', 'lg-ico--three'],
    ['overnight', 'lg-ico--overnight'],
    ['older', 'lg-ico--older'],
  ] as const;
  return (
    <div className="legend">
      <h2 className="legend__title">{t('legend.title')}</h2>
      <ul className="legend__box">
        {items.map(([key, ico]) => (
          <li key={key}>
            <span className={`lg-ico ${ico}`} aria-hidden />
            {t(`legend.${key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveButton() {
  const { t } = useTranslation();
  const { state, saving, saveDraft } = useApp();
  const dirty = selectedTeams(state.ws).some(isDirty);
  return (
    <button type="button" className="fbtn fbtn--save" onClick={() => void saveDraft()} disabled={saving || !state.ws.selected.length}>
      <FloppyIcon className="fbtn__floppy" />
      <span className="fbtn__stack">
        <span className="fbtn__main">{t('footer.saveDraft')}</span>
        <span className="fbtn__sub" data-testid="save-status">
          {saving ? t('footer.saving') : dirty ? t('footer.unsaved') : t('footer.allSaved')}
        </span>
      </span>
    </button>
  );
}

export function Footer() {
  const { t } = useTranslation();
  const { workflow, board, state } = useApp();
  const [sheet, setSheet] = useState(false);
  return (
    <footer className="ftr" style={{ '--batch': oklchGray(board.nextBatchLightness) } as CSSProperties}>
      <div className="ftr__desk-mass">
        <MassPanel />
      </div>
      <div className="ftr__legend">
        <Legend />
      </div>
      <button type="button" className="fbtn fbtn--ink fbtn--settings" onClick={() => window.history.back()}>
        <ArrowIcon left className="fbtn__arrow" />
        <span>{t('footer.settings')}</span>
      </button>
      <SaveButton />
      <button
        type="button"
        className="fbtn fbtn--ink fbtn--confirm"
        onClick={() => workflow.send({ type: 'REVIEW' })}
        disabled={!state.ws.selected.length}
      >
        <span>{t('footer.confirm')}</span>
        <ArrowIcon className="fbtn__arrow" />
      </button>
      <button
        type="button"
        className={`fbtn fbtn--tools ${state.mass.onTouch ? 'fbtn--tools-on' : ''}`}
        aria-expanded={sheet}
        aria-controls="tools-sheet"
        onClick={() => setSheet((s) => !s)}
      >
        <span className="fbtn__swatch" aria-hidden />
        {t('footer.mass')}
      </button>
      {sheet ? (
        <div className="sheet" id="tools-sheet" role="dialog" aria-label={t('mobile.tools')}>
          <button type="button" className="sheet__close" onClick={() => setSheet(false)}>
            {t('mobile.close')}
          </button>
          <MassPanel withLocks />
          <Legend />
        </div>
      ) : null}
    </footer>
  );
}
