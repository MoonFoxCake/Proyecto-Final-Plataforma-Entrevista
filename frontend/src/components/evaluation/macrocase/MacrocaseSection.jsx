import { useEffect, useRef, useState } from 'react';
import { AvatarPanel, useAvatarSpeech } from './AvatarPanel.jsx';
import { MacrocaseProgress } from './MacrocaseProgress.jsx';
import { MacrocaseText } from './MacrocaseText.jsx';

// Short pause between the avatar appearing and its first words.
const NARRATION_DELAY_MS = 700;

/**
 * Narrative step of one section: the avatar narrates the text while it is
 * also shown on screen. Listening is optional: the button to move on
 * unlocks once the candidate has scrolled to the end of the text, whether
 * or not the narration finished.
 */
export function MacrocaseSection({ section, progress, busy, onContinue }) {
  const endRef = useRef(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const speech = useAvatarSpeech({
    text: section.narrative,
    audioUrl: section.narrativeAudio?.audioUrl,
    visemes: section.narrativeAudio?.visemes,
  });

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

  // Narrate as soon as the avatar is drawn. The candidate already clicked to
  // get here, so the browser allows the audio.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await speech.whenReady();
      await new Promise((resolve) => { setTimeout(resolve, NARRATION_DELAY_MS); });
      if (!cancelled) speech.speak();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToQuestions = () => {
    speech.stop();
    onContinue();
  };

  return (
    <main className='mx-auto max-w-5xl px-5 py-10 sm:py-14'>
      <MacrocaseProgress step='narrative' progress={progress} />

      <div className='grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]'>
        <AvatarPanel speech={speech} label='Asistente virtual que narra esta sección del caso' what='la narración' />

        <div>
          <article className='rounded-2xl border border-[#D9E2EA] bg-white p-6 shadow-sm sm:p-10'>
            <span className='inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0A8F8A]'>Sección {section.order} de {progress.totalSections}</span>
            <h1 className='mt-5 font-display text-2xl font-bold text-[#10233A]'>{section.title || `Parte ${section.order}`}</h1>
            <p className='mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800' role='note'>Lee con atención: cuando pases a las preguntas de esta sección <strong>no podrás volver a ver este texto</strong>.</p>
            <MacrocaseText text={section.narrative} className='mt-7' />
            <div ref={endRef} className='mt-8 border-t border-[#DDE5EC]' />
          </article>

          <div className='sticky bottom-0 -mx-5 mt-6 flex flex-col items-center gap-2 bg-gradient-to-t from-[#F6F9FC] via-[#F6F9FC] to-transparent px-5 pb-6 pt-6 sm:flex-row sm:justify-between'>
            <p className='text-xs text-[#7C8AA0]' aria-live='polite'>{reachedEnd ? 'Al continuar, este texto dejará de estar visible.' : 'Lee el texto hasta el final para continuar.'}</p>
            <button type='button' onClick={goToQuestions} disabled={!reachedEnd || busy} className='rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0F8F8B] disabled:cursor-not-allowed disabled:bg-[#BCC7D1]'>Continuar a las preguntas →</button>
          </div>
        </div>
      </div>
    </main>
  );
}
