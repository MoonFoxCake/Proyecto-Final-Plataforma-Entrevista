import { useEffect, useId, useRef } from 'react';

/**
 * Modal dialog: focus moves inside on open and back on close, Escape closes
 * it (unless `busy`), and the page behind is marked inert to assistive tech
 * through `aria-modal`.
 *
 * @param {{ title: string, description?: string, onClose: () => void, busy?: boolean,
 *   footer: import('react').ReactNode, children?: import('react').ReactNode }} props
 */
export function Dialog({ title, description, onClose, busy = false, footer, children }) {
  const titleId = useId();
  const panel = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    const first = panel.current?.querySelector('input, select, textarea, button:not([disabled])');
    first?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className='fixed inset-0 z-50 overflow-y-auto bg-[#0B1A2B]/50 p-4' role='dialog' aria-modal='true' aria-labelledby={titleId}>
      <div ref={panel} className='mx-auto my-10 max-w-lg rounded-2xl bg-white shadow-2xl'>
        <div className='px-6 pt-6'>
          <h2 id={titleId} className='font-display text-lg font-bold text-[#101828]'>{title}</h2>
          {description && <p className='mt-1 text-sm leading-6 text-[#56677B]'>{description}</p>}
        </div>
        {children && <div className='px-6 pt-5'>{children}</div>}
        <div className='mt-6 flex flex-wrap justify-end gap-3 rounded-b-2xl border-t border-[#EEF2F6] px-6 py-4'>{footer}</div>
      </div>
    </div>
  );
}
