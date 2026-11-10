import { useEffect, useRef } from 'react';

/** Native modal supplies focus trapping, background inertness and Escape handling. */
export function MicrocaseDialog({ title, description, onClose, busy = false, wide = false, children, footer }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; previous?.focus?.(); };
  }, []);
  return <dialog ref={dialog} aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className={`fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-0 bg-white p-0 text-[#10233A] shadow-2xl backdrop:bg-[#0B1A2B]/60 ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#EEF2F6] bg-white px-5 py-5 sm:px-6">
      <div><h2 className="font-display text-xl font-bold">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-[#64748B]">{description}</p>}</div>
      <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar ventana" className="rounded-lg px-2 text-2xl leading-7 text-[#64748B] hover:bg-[#F1F5F9] focus-visible:outline-teal-600 disabled:opacity-40">×</button>
    </header>
    <div className="p-5 sm:p-6">{children}</div>
    {footer && <footer className="sticky bottom-0 z-10 border-t border-[#EEF2F6] bg-white px-5 py-4 sm:px-6">{footer}</footer>}
  </dialog>;
}
