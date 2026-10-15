/**
 * A start or end time on a card: shows HH:MM (or XX:XX / ≠), edits in place on click,
 * and offers the U-turn button when it overwrote an already chosen time.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Field } from '../../domain/interval';
import { formatWallTime, parseWallTime, type WallTime } from '../../domain/time';
import type { FieldView } from '../../domain/workspace';
import { ClockIcon, UTurnIcon } from '../icons';

export interface TimeFieldProps {
  field: Field;
  view: FieldView;
  label: string;
  prefix?: string | null;
  revertTo: WallTime | null;
  /** In touch-overwrite mode the field doesn't open its editor on pointer clicks. */
  paintMode: boolean;
  className?: string;
  onCommit: (minutes: WallTime | null) => void;
  onRevert: () => void;
}

export function TimeField({ field, view, label, prefix, revertTo, paintMode, className, onCommit, onRevert }: TimeFieldProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const shown = view.kind === 'value' ? formatWallTime(view.minutes) : view.kind === 'mixed' ? t('card.mixed') : t('card.empty');

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const begin = () => {
    setDraft(view.kind === 'value' ? formatWallTime(view.minutes) : '');
    setError(false);
    setEditing(true);
  };

  const commit = () => {
    const raw = draft.trim();
    if (raw === '') {
      onCommit(null);
      setEditing(false);
      return;
    }
    const parsed = parseWallTime(raw);
    if (parsed === null) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    onCommit(parsed);
    setEditing(false);
  };

  return (
    <div className={`tf tf--${field} ${className ?? ''}`} data-field={field}>
      {revertTo !== null && !editing ? (
        <button
          type="button"
          className="tf__revert"
          aria-label={t('card.revert', { time: formatWallTime(revertTo) })}
          title={t('card.revert', { time: formatWallTime(revertTo) })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRevert();
          }}
        >
          <UTurnIcon />
        </button>
      ) : null}
      {prefix && !editing ? <span className="tf__prefix">{prefix}</span> : null}
      {editing ? (
        <input
          ref={inputRef}
          className="tf__input mono"
          aria-label={label}
          aria-invalid={error}
          aria-describedby={error ? errorId : undefined}
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          placeholder="HH:MM"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
          onBlur={() => (parseWallTime(draft) !== null || draft.trim() === '' ? commit() : setEditing(false))}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          className={`tf__value mono ${view.kind !== 'value' ? 'tf__value--empty' : ''}`}
          aria-label={`${label}: ${shown}`}
          onClick={(e) => {
            // A pointer click in paint mode belongs to the stroke; keyboard still edits.
            if (paintMode && e.detail > 0) return;
            begin();
          }}
        >
          {shown}
        </button>
      )}
      <ClockIcon className="tf__clock" />
      {error ? (
        <span id={errorId} role="alert" className="tf__error">
          {t('card.invalid')}
        </span>
      ) : null}
    </div>
  );
}
