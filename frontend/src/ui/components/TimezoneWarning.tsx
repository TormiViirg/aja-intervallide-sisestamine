/**
 * Estonian-time warning. The device zone is stored in a cookie through TimezonePreferencePort.
 * The eye button hides the explanation, leaving only the one-line title (partially hidden).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ESTONIAN_TIME_ZONE } from '../../domain/time';
import { useApp } from '../AppProvider';
import { EyeIcon } from '../icons';
import './timezoneWarning.css';

export function TimezoneWarning() {
  const { t } = useTranslation();
  const { ports } = useApp();
  // The port is synchronous (cookies), so read it during the first render — no flash of a missing warning.
  const [zone] = useState(() => ports.timezone.rememberDeviceZone());
  const [collapsed, setCollapsed] = useState(() => ports.timezone.isWarningCollapsed() ?? zone === ESTONIAN_TIME_ZONE);

  const differs = zone !== ESTONIAN_TIME_ZONE;
  const toggle = () => {
    setCollapsed((c) => {
      ports.timezone.setWarningCollapsed(!c);
      return !c;
    });
  };

  return (
    <div className={`tzw ${collapsed ? 'tzw--collapsed' : ''} ${differs ? 'tzw--differs' : ''}`} role="note" data-testid="tz-warning">
      <span className="tzw__stripe" aria-hidden />
      <strong className="tzw__title">{t('tz.title')}</strong>
      {!collapsed ? (
        <span className="tzw__body" data-testid="tz-body">
          {differs ? t('tz.body', { zone }) : t('tz.bodySame')}
        </span>
      ) : null}
      <button
        type="button"
        className="tzw__eye"
        aria-expanded={!collapsed}
        aria-label={collapsed ? t('tz.show') : t('tz.hide')}
        title={collapsed ? t('tz.show') : t('tz.hide')}
        onClick={toggle}
      >
        <EyeIcon closed={!collapsed} />
      </button>
    </div>
  );
}

export function MobileProgress() {
  const { t } = useTranslation();
  const { board } = useApp();
  const { done, total } = board.progress;
  return (
    <div className="mprog">
      <div className="mprog__label">
        <span>{t('mobile.progress', { done, total })}</span>
      </div>
      <div
        className="mprog__bar"
        role="progressbar"
        aria-label={t('mobile.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        data-testid="mobile-progress"
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < done ? 'mprog__seg mprog__seg--done' : 'mprog__seg'} />
        ))}
      </div>
    </div>
  );
}
