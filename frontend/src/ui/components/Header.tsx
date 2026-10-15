import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocationId, TeamId } from '../../domain/brand';
import { formatFullDate, formatStamp } from '../../domain/time';
import { headerStatus } from '../../application/selectors';
import { useApp } from '../AppProvider';
import { ChevronIcon, CloseIcon } from '../icons';
import { Popover, useDismiss } from './Popover';
import { RangePicker } from './RangePicker';
import './header.css';

export function Header({ volunteersOpen, onToggleVolunteers }: { volunteersOpen: boolean; onToggleVolunteers: () => void }) {
  return (
    <header className="hdr">
      <StatusBlock />
      <LocationsPicker />
      <RangeField />
      <TeamPicker />
      <button
        type="button"
        className="hdr__volunteers"
        aria-expanded={volunteersOpen}
        aria-controls="volunteer-panel"
        onClick={onToggleVolunteers}
      >
        <VolunteersTitle open={volunteersOpen} />
      </button>
    </header>
  );
}

function VolunteersTitle({ open }: { open: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <span>{t('volunteers.title')}</span>
      <ChevronIcon up={open} className="hdr__chev" />
    </>
  );
}

function StatusBlock() {
  const { t } = useTranslation();
  const { state } = useApp();
  const status = headerStatus(state.ws);
  return (
    <div className="hdr__status">
      <div className="hdr__label hdr__label--muted">{t('status.label')}</div>
      <div className="hdr__status-value" data-testid="status">
        {status ? t(`status.${status.kind}`) : '—'}
      </div>
      {status && 'at' in status ? <div className="hdr__stamp mono">{formatStamp(status.at)}</div> : null}
    </div>
  );
}

function LocationsPicker() {
  const { t } = useTranslation();
  const { state, dispatch, data } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const selected = state.ws.locationIds;
  const set = (ids: LocationId[]) => dispatch({ type: 'SET_LOCATIONS', locationIds: ids });
  const byId = new Map(data.ref.locations.map((l) => [l.id, l.name]));

  return (
    <div className="hdr__locations" ref={ref}>
      <button type="button" className="hdr__picker" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="hdr__label">{t('locations.label')}</span>
        <ChevronIcon up={open} className="hdr__chev" />
      </button>
      <ul className="hdr__chips" aria-label={t('locations.label')}>
        {selected.map((id) => (
          <li key={id} className="chip">
            {byId.get(id) ?? id}
            <button
              type="button"
              className="chip__x"
              aria-label={t('locations.remove', { name: byId.get(id) ?? id })}
              onClick={() => set(selected.filter((x) => x !== id))}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
        {selected.length === 0 ? <li className="hdr__hint">{t('locations.none')}</li> : null}
      </ul>
      <Popover open={open} label={t('locations.label')} className="hdr__menu">
        {data.ref.locations.map((l) => (
          <label key={l.id} className="check">
            <input
              type="checkbox"
              checked={selected.includes(l.id)}
              onChange={(e) => set(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))}
            />
            <span>{l.name}</span>
          </label>
        ))}
      </Popover>
    </div>
  );
}

function RangeField() {
  const { t } = useTranslation();
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const { from, to } = state.ws.range;
  return (
    <div className="hdr__range" ref={ref}>
      <div className="hdr__label hdr__range-title" id="range-label">
        {t('range.label')}
      </div>
      <button
        type="button"
        className="hdr__range-value mono"
        aria-labelledby="range-label"
        aria-describedby="range-hint"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {formatFullDate(from)} - {formatFullDate(to)}
      </button>
      <span id="range-hint" className="visually-hidden">
        {t('range.open')}
      </span>
      {open ? <RangePicker onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function TeamPicker() {
  const { t } = useTranslation();
  const { state, dispatch, data, saveDraft, toast } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const selected = state.ws.selected;
  const name = (id: TeamId) => data.ref.teams.find((x) => x.id === id)?.name ?? id;
  const known = data.ref.teams.filter((x) => x.id in state.ws.teams);
  const parked = known.filter((x) => !selected.includes(x.id));

  const toggle = (id: TeamId, on: boolean) => {
    if (on) {
      dispatch({ type: 'SELECT_TEAMS', teamIds: [...selected, id] });
      return;
    }
    dispatch({ type: 'SELECT_TEAMS', teamIds: selected.filter((x) => x !== id) });
    // Removing a team parks it: its draft is saved so work on it is never lost.
    void saveDraft([id]).then(() => toast(t('team.savedOnRemove', { team: name(id) })));
  };

  return (
    <div className="hdr__team" ref={ref}>
      <button type="button" className="hdr__picker" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="hdr__label">{t('team.label')}</span>
        <ChevronIcon up={open} className="hdr__chev" />
      </button>
      <div className="hdr__team-value" data-testid="team-value">
        {selected.length ? selected.map(name).join(', ') : t('team.none')}
      </div>
      <Popover open={open} label={t('team.label')} className="hdr__menu hdr__menu--right">
        {known.map((team) => (
          <label key={team.id} className="check">
            <input type="checkbox" checked={selected.includes(team.id)} onChange={(e) => toggle(team.id, e.target.checked)} />
            <span>{team.name}</span>
          </label>
        ))}
        {selected.length > 1 ? <p className="hdr__hint">{t('team.jointHint')}</p> : null}
        {parked.length ? (
          <div className="hdr__parked">
            <div className="hdr__parked-title">{t('team.parkedTitle')}</div>
            {parked.map((team) => (
              <button
                key={team.id}
                type="button"
                className="hdr__continue"
                onClick={() => {
                  dispatch({ type: 'SELECT_TEAMS', teamIds: [team.id] });
                  setOpen(false);
                }}
              >
                {team.name}: {t('team.continueOnly')}
              </button>
            ))}
          </div>
        ) : null}
      </Popover>
    </div>
  );
}
