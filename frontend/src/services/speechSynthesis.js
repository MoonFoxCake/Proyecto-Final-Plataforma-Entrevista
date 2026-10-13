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

// Chrome stops long utterances after about 15 seconds, so section
// narratives are spoken as a queue of short chunks (paragraphs, split at
// sentence ends when they are long).
const MAX_CHUNK_LENGTH = 220;

/** Splits `text` into chunks of about MAX_CHUNK_LENGTH characters at most, cutting at sentence ends. */
export function splitForSpeech(text) {
  const chunks = [];
  for (const paragraph of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    let current = '';
    for (const sentence of paragraph.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) || [paragraph]) {
      if (current && (current + sentence).length > MAX_CHUNK_LENGTH) {
        chunks.push(current.trim());
        current = '';
      }
      current += sentence;
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks;
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
  const chunks = text ? splitForSpeech(text) : [];

  if (!isSpeechSynthesisSupported() || !chunks.length) {
    resolveDone({ completed: false, reason: NO_SPANISH_VOICE });
    return { done, cancel: () => {} };
  }

  findSpanishVoice().then((voice) => {
    if (cancelled) return;
    if (!voice) {
      resolveDone({ completed: false, reason: NO_SPANISH_VOICE });
      return;
    }
    window.speechSynthesis.cancel();
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.95;
      if (index === 0) utterance.onstart = () => onStart?.();
      if (index === chunks.length - 1) utterance.onend = () => resolveDone({ completed: !cancelled });
      utterance.onerror = () => resolveDone({ completed: false });
      window.speechSynthesis.speak(utterance);
    });
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
