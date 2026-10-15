import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import { useApp, useWorkflowState } from './AppProvider';
import { Board } from './components/Board';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Overview } from './components/Overview';
import { MobileProgress, TimezoneWarning } from './components/TimezoneWarning';
import { VolunteerPanel } from './components/VolunteerPanel';
import './app.css';

function LanguageSwitch() {
  const { t } = useTranslation();
  const { language, setLanguage } = useApp();
  return (
    <nav className="lang" aria-label={t('language.label')}>
      {LANGUAGES.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={language === l} onClick={() => setLanguage(l)}>
          {t(`language.${l}`)}
        </button>
      ))}
    </nav>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className="toast">
          {x.text}
        </div>
      ))}
    </div>
  );
}

/** Publishes the root's client width (without scrollbar) as --vw for the --u calculation. */
function useViewportWidth(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => root.style.setProperty('--vw', `${root.clientWidth}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);
}

export function App() {
  useViewportWidth();
  const wf = useWorkflowState();
  const [volunteersOpen, setVolunteersOpen] = useState(false);
  const editing = wf.value === 'editing';
  return (
    <div className="viewport">
      <div className="app">
        <LanguageSwitch />
        <TimezoneWarning />
        <Header volunteersOpen={volunteersOpen} onToggleVolunteers={() => setVolunteersOpen((o) => !o)} />
        {editing ? (
          <>
            <MobileProgress />
            <VolunteerPanel open={volunteersOpen} onClose={() => setVolunteersOpen(false)} />
            <Board />
            <Footer />
          </>
        ) : (
          <Overview />
        )}
        <Toasts />
      </div>
    </div>
  );
}

export function Loading() {
  return <p className="loading">…</p>;
}
