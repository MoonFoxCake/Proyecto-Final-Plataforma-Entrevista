import { useCallback, useRef, useState } from 'react';
import { AUTOPLAY_BLOCKED, TalkingAvatarView } from '../../avatar/TalkingAvatarView.jsx';
import { NO_SPANISH_VOICE } from '../../../services/speechSynthesis.js';
import { fromMicrosoftVisemes } from '../../../lib/talking-avatar/index.js';

/**
 * Speech of one piece of content (a section narrative or a question) by the
 * avatar. Each stage mounts its own avatar, and unmounting it cuts whatever
 * it was saying, so audio from different stages never overlaps.
 *
 * `speak()` always starts from the beginning (repeat); `stop()` cuts it.
 */
export function useAvatarSpeech({ text, audioUrl, visemes }) {
  const avatarRef = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const [ready, setReady] = useState(false);
  const [played, setPlayed] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const speak = useCallback(async () => {
    setPlayed(true);
    // Generated voices come with Azure viseme ids for exact lip-sync; uploaded
    // audio has none and the mouth follows the volume instead.
    const timeline = visemes?.length ? fromMicrosoftVisemes(visemes) : null;
    const result = await avatarRef.current?.speak({ text, audioUrl: audioUrl || '', visemes: timeline });
    setVoiceUnavailable(result?.reason === NO_SPANISH_VOICE);
    setAutoplayBlocked(result?.reason === AUTOPLAY_BLOCKED);
    return result;
  }, [text, audioUrl, visemes]);

  const stop = useCallback(() => avatarRef.current?.stop(), []);
  const whenReady = useCallback(() => avatarRef.current?.whenReady() ?? Promise.resolve(), []);

  return {
    avatarRef, speaking, ready, played, voiceUnavailable, autoplayBlocked, speak, stop, whenReady,
    onSpeakingChange: setSpeaking,
    onReady: () => setReady(true),
  };
}

/** Avatar with its status, play/stop/repeat control and audio notices. */
export function AvatarPanel({ speech, label, what }) {
  const { speaking, ready, played } = speech;
  return (
    <section className='self-start rounded-2xl border border-[#D9E2EA] bg-white p-4 shadow-sm lg:sticky lg:top-6'>
      <div className='mx-auto max-w-[200px] overflow-hidden rounded-xl sm:max-w-[320px] lg:max-w-none'>
        <TalkingAvatarView ref={speech.avatarRef} label={label} onSpeakingChange={speech.onSpeakingChange} onReady={speech.onReady} />
      </div>
      <div className='mt-4 flex items-center justify-between gap-3 px-1'>
        <span className='flex items-center gap-2 text-xs font-medium text-[#64748B]' aria-live='polite'>
          <span className={`h-2 w-2 rounded-full ${speaking ? 'animate-pulse bg-[#18A9A4]' : 'bg-[#AEBCCA]'}`} />
          {!ready ? 'Preparando al asistente…' : speaking ? 'El asistente está hablando…' : 'Asistente virtual'}
        </span>
        {speaking ? (
          <button type='button' onClick={speech.stop} className='shrink-0 whitespace-nowrap rounded-xl border border-[#D9E2EA] px-3 py-2 text-xs font-semibold text-[#475569] transition hover:bg-[#F6F9FC]'>■ Detener</button>
        ) : (
          <button type='button' onClick={speech.speak} disabled={!ready} className='shrink-0 whitespace-nowrap rounded-xl border border-[#D9E2EA] px-3 py-2 text-xs font-semibold text-[#475569] transition hover:bg-[#F6F9FC] disabled:cursor-not-allowed disabled:opacity-50'>
            {played ? '↻ Escuchar de nuevo' : `▶ Escuchar ${what}`}
          </button>
        )}
      </div>
      {speech.autoplayBlocked && <p className='mt-3 rounded-xl border border-[#CDEBEA] bg-[#E8F7F6] p-3 text-xs leading-5 text-[#087D79]'>Tu navegador no permitió reproducir el audio automáticamente. Pulsa <strong>Escuchar de nuevo</strong> para oír {what === 'la narración' ? 'la narración' : 'la pregunta'}.</p>}
      {speech.voiceUnavailable && <p className='mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800'>No se pudo reproducir el audio y tu navegador no tiene una voz en español. Lee el texto en pantalla; puedes continuar con normalidad.</p>}
    </section>
  );
}
