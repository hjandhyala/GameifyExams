'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/** Bottom sheet on mobile, centered modal on desktop (§6.4). Focus-trapped, Esc to close. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    const el = ref.current;
    const focusables = () =>
      el ? [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled')) : [];
    setTimeout(() => (focusables()[0] ?? el)?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center" role="presentation">
      <div className="anim-fade-in absolute inset-0 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`anim-sheet-in relative z-10 max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[20px] bg-surface p-5 pb-8 shadow-2xl md:rounded-[20px] ${wide ? 'md:max-w-2xl' : 'md:max-w-lg'} safe-bottom`}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border md:hidden" aria-hidden="true" />
        <div className="mb-2 flex items-start justify-between gap-4">
          {title ? <h2 className="text-xl font-bold">{title}</h2> : <span />}
          <button onClick={onClose} className="-mr-2 -mt-1 grid h-11 w-11 place-items-center rounded-full text-2xl text-muted hover:bg-surface-2" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
