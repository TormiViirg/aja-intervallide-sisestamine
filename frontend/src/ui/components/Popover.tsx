import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

/** Closes on Escape or a pointer press outside `ref`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, ref]);
}

export function Popover({ open, className, children, label }: { open: boolean; className?: string; children: ReactNode; label: string }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label={label} className={`popover ${className ?? ''}`}>
      {children}
    </div>
  );
}
