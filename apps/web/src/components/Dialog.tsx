import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Modal dialog. Centred card on desktop; full screen on phones with the footer pinned to the bottom.
 * Closes on Escape and on the backdrop. Focus moves into the dialog and returns afterwards.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-center md:p-6">
      <button type="button" aria-label="Close" tabIndex={-1} className="no-fx backdrop-in absolute inset-0 bg-black/40 cursor-default" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative bg-bg flex flex-col w-full h-full md:h-auto md:max-h-[calc(100dvh-48px)] md:rounded-lg md:shadow-pop ${size === 'sm' ? 'md:max-w-md' : 'md:max-w-2xl'}`}
      >
        <div className="flex items-center gap-2 h-14 shrink-0 px-2 md:px-6 border-b border-line">
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close"
            className="md:hidden size-11 rounded-md flex items-center justify-center hover:bg-surface-2 cursor-pointer"
          >
            <Icon name="close" size={22} />
          </button>
          <h2 id={titleId} className="grow text-[18px] md:text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close"
            className="hidden md:flex size-9 rounded-sm items-center justify-center hover:bg-surface-2 cursor-pointer"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="grow overflow-y-auto px-4 py-5 md:px-6">{children}</div>
        {footer && (
          <div
            className="shrink-0 flex flex-wrap items-center gap-2 px-4 pt-3 md:px-6 md:pb-4 border-t border-line"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
