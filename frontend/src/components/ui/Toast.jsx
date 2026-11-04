import { useCallback, useEffect, useRef, useState } from 'react';

const DURATION_MS = 5000;

const TONES = {
  success: 'border-[#A7E4DE] bg-white text-[#087D79]',
  warning: 'border-amber-200 bg-white text-amber-800',
};

/**
 * Temporary notifications for completed actions ("Se enviaron 3
 * citaciones"). Persistent states belong in the page itself; errors stay
 * inline where they happened.
 *
 * @returns {{ notify: (message: string, tone?: 'success'|'warning') => void, toast: import('react').ReactNode }}
 */
export function useToast() {
  const [current, setCurrent] = useState(null);
  const timer = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const notify = useCallback((message, tone = 'success') => {
    clearTimeout(timer.current);
    setCurrent({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setCurrent(null), DURATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const toast = (
    <div className='pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end' aria-live='polite' role='status'>
      {current && (
        <div key={current.id} className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${TONES[current.tone] || TONES.success}`}>
          <span aria-hidden='true'>{current.tone === 'warning' ? '!' : '✓'}</span>
          <p className='flex-1'>{current.message}</p>
          <button type='button' onClick={dismiss} aria-label='Cerrar notificación' className='text-base leading-none opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40'>×</button>
        </div>
      )}
    </div>
  );

  return { notify, toast };
}
