import { useEffect, useRef, useState } from 'react';
import { MacrocaseText } from './MacrocaseText.jsx';

/**
 * Reading step: the full case text. The button to move on unlocks once the
 * candidate has scrolled to the end of the text.
 */
export function MacrocaseReading({ macrocase, onContinue }) {
  const endRef = useRef(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setReachedEnd(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setReachedEnd(true);
    });
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <main className='mx-auto max-w-3xl px-5 py-10 sm:py-16'>
      <div className='mb-5 flex items-center justify-between text-xs font-medium text-[#64748B]'>
        <span>Módulo B · Macrocaso</span>
        <span>Lectura del caso</span>
      </div>

      <article className='rounded-2xl border border-[#D9E2EA] bg-white p-6 shadow-sm sm:p-10'>
        <span className='inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0A8F8A]'>Contenido demostrativo</span>
        <h1 className='mt-5 font-display text-2xl font-bold text-[#10233A]'>{macrocase.name}</h1>
        {macrocase.description && <p className='mt-1 text-sm italic text-[#7C8AA0]'>{macrocase.description}</p>}
        <p className='mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800' role='note'>Lee con atención: cuando pases a las preguntas <strong>no podrás volver a ver este texto</strong>.</p>
        <MacrocaseText text={macrocase.introduction} className='mt-7' />
        <div ref={endRef} className='mt-8 border-t border-[#DDE5EC]' />
      </article>

      <div className='sticky bottom-0 -mx-5 mt-6 flex flex-col items-center gap-2 bg-gradient-to-t from-[#F6F9FC] via-[#F6F9FC] to-transparent px-5 pb-6 pt-6 sm:flex-row sm:justify-between'>
        <p className='text-xs text-[#7C8AA0]' aria-live='polite'>{reachedEnd ? 'Al continuar, el caso dejará de estar visible.' : 'Lee el caso hasta el final para continuar.'}</p>
        <button type='button' onClick={onContinue} disabled={!reachedEnd} className='rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0F8F8B] disabled:cursor-not-allowed disabled:bg-[#BCC7D1]'>Comenzar preguntas →</button>
      </div>
    </main>
  );
}
