/**
 * Adaptadores: convierten la salida de distintos TTS / herramientas de
 * lip-sync a la timeline del avatar [{ time (s), viseme }].
 *
 * Pueden usarse en el cliente o (mejor) en tu backend antes de responder
 * { audioUrl, visemes }.
 */

/**
 * IDs 0–21 de Microsoft: los mismos en Azure Speech (evento VisemeReceived)
 * y en Windows SAPI (evento VisemeReached).
 * Nota: /i/ (6) se asigna a E porque visualmente es una boca estirada y poco
 * abierta; los diptongos que empiezan por /a/ (9, 11) van a AI.
 */
const MICROSOFT_VISEME_IDS = [
  'REST', // 0  silencio
  'AI',   // 1  æ ə ʌ
  'AI',   // 2  ɑ
  'O',    // 3  ɔ
  'E',    // 4  ɛ ʊ eɪ
  'E',    // 5  ɝ
  'E',    // 6  j i ɪ
  'U',    // 7  w u
  'O',    // 8  o
  'AI',   // 9  aʊ
  'O',    // 10 ɔɪ
  'AI',   // 11 aɪ
  'E',    // 12 h
  'L',    // 13 ɹ
  'L',    // 14 l
  'L',    // 15 s z
  'U',    // 16 ʃ tʃ dʒ ʒ
  'L',    // 17 ð θ
  'FV',   // 18 f v
  'L',    // 19 d t n
  'L',    // 20 k g ŋ
  'MBP',  // 21 p b m
];

const POLLY_VISEMES = {
  sil: 'REST', p: 'MBP', t: 'L', S: 'U', T: 'L', f: 'FV', k: 'L', i: 'E',
  r: 'L', s: 'L', u: 'U', '@': 'AI', a: 'AI', e: 'E', E: 'E', o: 'O', O: 'O',
};

const RHUBARB_SHAPES = {
  X: 'REST', A: 'MBP', B: 'L', C: 'E', D: 'AI', E: 'O', F: 'U', G: 'FV', H: 'L',
};

/**
 * Une visemas repetidos consecutivos y absorbe los que duran menos de
 * `minDurationSec` (la boca no llegaría a verse y solo añade temblor).
 */
export function compactTimeline(timeline, { minDurationSec = 0.035 } = {}) {
  const sorted = [...timeline].sort((a, b) => a.time - b.time);
  const result = [];
  sorted.forEach((entry, index) => {
    const next = sorted[index + 1];
    const tooShort = next && next.time - entry.time < minDurationSec && entry.viseme !== 'REST';
    if (tooShort) return;
    if (result.length && result[result.length - 1].viseme === entry.viseme) return;
    result.push({ time: entry.time, viseme: entry.viseme });
  });
  if (!result.length || result[0].time > 0) result.unshift({ time: 0, viseme: 'REST' });
  return result;
}

/** Eventos con IDs de Microsoft en milisegundos: [{ offsetMs, visemeId }]. */
export function fromMicrosoftVisemes(events, options) {
  const timeline = events.map(({ offsetMs, visemeId }) => ({
    time: offsetMs / 1000,
    viseme: MICROSOFT_VISEME_IDS[visemeId] ?? 'REST',
  }));
  return compactTimeline(timeline, options);
}

/** Azure Speech SDK: e.audioOffset viene en ticks de 100 ns. [{ audioOffset, visemeId }]. */
export function fromAzureVisemes(events, options) {
  return fromMicrosoftVisemes(
    events.map(({ audioOffset, visemeId }) => ({ offsetMs: audioOffset / 10_000, visemeId })),
    options,
  );
}

/** Amazon Polly speech marks (SpeechMarkTypes: ['viseme']): [{ time (ms), type, value }]. */
export function fromPollySpeechMarks(marks, options) {
  const timeline = marks
    .filter((mark) => mark.type === 'viseme')
    .map((mark) => ({ time: mark.time / 1000, viseme: POLLY_VISEMES[mark.value] ?? 'REST' }));
  return compactTimeline(timeline, options);
}

/** Rhubarb Lip Sync (salida JSON): { mouthCues: [{ start, end, value }] }. */
export function fromRhubarb(json, options) {
  const timeline = json.mouthCues.map((cue) => ({ time: cue.start, viseme: RHUBARB_SHAPES[cue.value] ?? 'REST' }));
  return compactTimeline(timeline, options);
}
