/**
 * Browser text-to-speech (Web Speech API), used to read a question aloud
 * when it has no pre-recorded audio.
 *
 * Which voices exist depends on the browser and OS: Edge and Chrome offer
 * online Spanish voices ("Microsoft … Online (Natural)", "Google español")
 * even when Windows only has English ones installed.
 */

// Closest accents first; any other Spanish voice is used as a last resort.
const PREFERRED_LANGS = ['es-GT', 'es-MX', 'es-US', 'es-419', 'es-ES'];
// Neural/online voices sound far more natural than the local SAPI ones.
const NATURAL_VOICE = /natural|online|neural|google/i;
// Browsers fill the voice list in steps (Edge: local voices first, online
// ones a moment later), so wait this long for a Spanish voice to appear.
const VOICES_TIMEOUT_MS = 2500;

export const NO_SPANISH_VOICE = 'no-spanish-voice';

// Looked up once per page: the voice list does not change afterwards.
let voicePromise = null;

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function voiceScore(voice) {
  const lang = voice.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('es')) return -1;
  const index = PREFERRED_LANGS.findIndex((item) => item.toLowerCase() === lang);
  const accentScore = index === -1 ? 0 : PREFERRED_LANGS.length - index;
  return accentScore + (NATURAL_VOICE.test(voice.name) ? 10 : 0);
}

function pickSpanishVoice(voices) {
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = voiceScore(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/** Resolves with the best Spanish voice, or null if none shows up in time. */
function findSpanishVoice() {
  voicePromise ??= new Promise((resolve) => {
    const settle = (voice) => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', check);
      resolve(voice);
    };
    const check = () => {
      const voice = pickSpanishVoice(window.speechSynthesis.getVoices());
      if (voice && NATURAL_VOICE.test(voice.name)) settle(voice);
    };
    const timer = setTimeout(() => settle(pickSpanishVoice(window.speechSynthesis.getVoices())), VOICES_TIMEOUT_MS);
    window.speechSynthesis.addEventListener('voiceschanged', check);
    check();
  });
  return voicePromise;
}

/** Starts looking up the Spanish voice ahead of time, so the first question is not delayed. */
export function prepareSpeech() {
  if (isSpeechSynthesisSupported()) findSpanishVoice();
}

/**
 * Speaks `text` in Spanish. If the browser has no Spanish voice it does not
 * speak at all (an English voice reading Spanish is unintelligible) and
 * resolves with `reason: NO_SPANISH_VOICE`.
 *
 * @returns {{ done: Promise<{ completed: boolean, reason?: string }>, cancel: () => void }}
 *   `done` resolves when speech ends, or with `completed: false` if it was
 *   cancelled or failed.
 */
export function speakText(text, { onStart } = {}) {
  let cancelled = false;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  if (!isSpeechSynthesisSupported() || !text) {
    resolveDone({ completed: false, reason: NO_SPANISH_VOICE });
    return { done, cancel: () => {} };
  }

  findSpanishVoice().then((voice) => {
    if (cancelled) return;
    if (!voice) {
      resolveDone({ completed: false, reason: NO_SPANISH_VOICE });
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.95;
    utterance.onstart = () => onStart?.();
    utterance.onend = () => resolveDone({ completed: !cancelled });
    utterance.onerror = () => resolveDone({ completed: false });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      window.speechSynthesis.cancel();
      resolveDone({ completed: false });
    },
  };
}
