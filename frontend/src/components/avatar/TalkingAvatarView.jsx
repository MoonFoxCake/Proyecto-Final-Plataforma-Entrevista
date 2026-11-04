import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TalkingAvatar, avatarConfig } from '../../lib/talking-avatar/index.js';
import { speakText } from '../../services/speechSynthesis.js';

const FADE_IN_MS = 400;

export const AUTOPLAY_BLOCKED = 'autoplay-blocked';

let preloadPromise = null;

/**
 * Starts downloading the avatar illustration ahead of time (e.g. while the
 * candidate reads the case) so it is cached when the avatar mounts.
 */
export function preloadAvatar() {
  if (!preloadPromise) {
    const img = new Image();
    img.src = avatarConfig.image;
    preloadPromise = img.decode().catch(() => {});
  }
  return preloadPromise;
}

/** Resolves once every illustration layer of the avatar is loaded and decoded (or failed). */
function whenImagesReady(container) {
  const images = [...container.querySelectorAll('img')];
  return Promise.all(images.map((img) => img.decode().catch(() => {}))).then(() => {});
}

/**
 * React wrapper around the vanilla `TalkingAvatar`.
 *
 * Until the illustration is loaded it shows a placeholder, then fades the
 * avatar in, so the candidate never sees the eyes and mouth floating over
 * an empty background.
 *
 * Exposes through `ref`:
 * - `whenReady()`: resolves when the avatar is fully drawn on screen.
 * - `speak({ text, audioUrl, visemes })`: waits for `whenReady()`, then plays
 *   `audioUrl` with lip-sync (viseme timeline if given, otherwise mouth
 *   follows volume). Without audio, or if it fails to load, reads `text`
 *   with the browser voice while the avatar moves its mouth. Resolves
 *   `{ completed }`.
 * - `stop()`: cuts any speech in progress (or about to start).
 *
 * Browsers only allow audio started after a user interaction with the page.
 */
export const TalkingAvatarView = forwardRef(function TalkingAvatarView(
  { label = 'Asistente virtual', className = '', onSpeakingChange, onReady },
  ref,
) {
  const containerRef = useRef(null);
  const avatarRef = useRef(null);
  const readyRef = useRef(null);
  const cancelSpeechRef = useRef(null);
  const speakIdRef = useRef(0);
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  const onReadyRef = useRef(onReady);
  onSpeakingChangeRef.current = onSpeakingChange;
  onReadyRef.current = onReady;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const avatar = new TalkingAvatar({ element: containerRef.current, label });
    avatarRef.current = avatar;
    setReady(false);
    readyRef.current = whenImagesReady(containerRef.current)
      .then(() => {
        if (!active) return;
        setReady(true);
        onReadyRef.current?.();
      })
      .then(() => new Promise((resolve) => { setTimeout(resolve, FADE_IN_MS); }));
    return () => {
      active = false;
      speakIdRef.current += 1;
      cancelSpeechRef.current?.();
      cancelSpeechRef.current = null;
      avatar.destroy();
      avatarRef.current = null;
    };
  }, [label]);

  const whenReady = useCallback(() => readyRef.current ?? Promise.resolve(), []);

  const stop = useCallback(() => {
    speakIdRef.current += 1;
    cancelSpeechRef.current?.();
    cancelSpeechRef.current = null;
    avatarRef.current?.stop();
    onSpeakingChangeRef.current?.(false);
  }, []);

  const speakWithBrowserVoice = useCallback(async (text, id) => {
    const avatar = avatarRef.current;
    const speech = speakText(text, {
      onStart: () => { if (id === speakIdRef.current) avatar?.setTalking(true); },
    });
    cancelSpeechRef.current = speech.cancel;
    const result = await speech.done;
    if (id === speakIdRef.current) {
      avatar?.setTalking(false);
      cancelSpeechRef.current = null;
    }
    return result;
  }, []);

  const speak = useCallback(async ({ text, audioUrl, visemes } = {}) => {
    stop();
    const id = speakIdRef.current;
    await whenReady();
    const avatar = avatarRef.current;
    if (!avatar || id !== speakIdRef.current) return { completed: false };

    onSpeakingChangeRef.current?.(true);
    try {
      if (audioUrl) {
        try {
          return await avatar.play(audioUrl, visemes ?? null);
        } catch (error) {
          if (id !== speakIdRef.current) return { completed: false };
          // Autoplay blocked: the audio is fine, it just needs a click
          // ("Escuchar de nuevo"); the browser voice would be blocked too.
          if (error?.message?.startsWith('El navegador bloqueó')) return { completed: false, reason: AUTOPLAY_BLOCKED };
          console.warn('No se pudo reproducir el audio de la pregunta; se usa la voz del navegador.', error);
        }
      }
      return await speakWithBrowserVoice(text, id);
    } finally {
      if (id === speakIdRef.current) onSpeakingChangeRef.current?.(false);
    }
  }, [stop, whenReady, speakWithBrowserVoice]);

  useImperativeHandle(ref, () => ({ speak, stop, whenReady }), [speak, stop, whenReady]);

  const { originalWidth, originalHeight, colors } = avatarConfig;
  return (
    <div className={`relative ${className}`} style={{ aspectRatio: `${originalWidth} / ${originalHeight}`, backgroundColor: colors.background }}>
      <div ref={containerRef} className={`transition-opacity ease-out ${ready ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDuration: `${FADE_IN_MS}ms` }} />
      {!ready && (
        <div className='absolute inset-0 flex items-center justify-center' role='status' aria-label='Cargando asistente'>
          <span className='h-8 w-8 animate-spin rounded-full border-[3px] border-[#11366B]/15 border-t-[#18A9A4]' />
        </div>
      )}
    </div>
  );
});
