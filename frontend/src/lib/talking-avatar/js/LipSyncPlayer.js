import { AudioAnalyzer } from './AudioAnalyzer.js';

const MEDIA_ERRORS = {
  1: 'carga abortada',
  2: 'error de red',
  3: 'no se pudo decodificar',
  4: 'formato no soportado o URL no encontrada',
};

/** Ordena y valida una timeline [{ time, viseme }]. */
export function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline)) throw new TypeError('La timeline de visemas debe ser un array');
  return timeline
    .filter((entry) => Number.isFinite(entry?.time) && typeof entry?.viseme === 'string')
    .map(({ time, viseme }) => ({ time: Math.max(0, time), viseme }))
    .sort((a, b) => a.time - b.time);
}

/** Visema activo en `time` (búsqueda binaria del último evento con time ≤ t). */
export function visemeAt(timeline, time) {
  let low = 0;
  let high = timeline.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timeline[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found === -1 ? 'REST' : timeline[found].viseme;
}

/**
 * Reproduce audio y emite el visema correspondiente en cada frame.
 *
 * El reloj es SIEMPRE audio.currentTime, leído en requestAnimationFrame: si el
 * audio se atasca, se busca (seek) o va con retraso, la boca lo sigue. No hay
 * setTimeout por visema que pueda desincronizarse.
 *
 * Con timeline → visemas fonéticos (prioridad).
 * Sin timeline (null o vacía) → AudioAnalyzer (fallback por volumen).
 */
export class LipSyncPlayer {
  constructor({ onViseme = () => {}, onStart = () => {}, leadTimeSec = 0, analyzerOptions } = {}) {
    this.onViseme = onViseme;
    this.onStart = onStart;
    this.leadTimeSec = leadTimeSec;
    this.analyzer = new AudioAnalyzer(analyzerOptions);
    this.session = null;
  }

  get isPlaying() {
    return this.session !== null;
  }

  /** 'timeline' | 'volume' | null */
  get mode() {
    if (!this.session) return null;
    return this.session.timeline ? 'timeline' : 'volume';
  }

  /**
   * @param {string} audioUrl
   * @param {Array<{time:number, viseme:string}>|null} [timeline]
   * @returns {Promise<{completed: boolean}>} se resuelve al terminar o al llamar a stop();
   *          se rechaza si el audio no se puede cargar o reproducir.
   */
  play(audioUrl, timeline = null) {
    this.stop();

    const normalized = timeline ? normalizeTimeline(timeline) : [];
    const useTimeline = normalized.length > 0;

    const audio = new Audio();
    audio.preload = 'auto';
    // Web Audio solo puede leer audio de otro dominio si se pide con CORS.
    if (!useTimeline) audio.crossOrigin = 'anonymous';

    const session = {
      audio,
      audioUrl,
      timeline: useTimeline ? normalized : null,
      controller: new AbortController(),
      rafId: 0,
      lastViseme: null,
      settled: false,
      resolve: null,
      reject: null,
    };
    this.session = session;

    const promise = new Promise((resolve, reject) => {
      session.resolve = resolve;
      session.reject = reject;
    });

    const { signal } = session.controller;
    audio.addEventListener('ended', () => this.finish(session, true), { signal });
    audio.addEventListener('error', () => this.fail(session, this.mediaError(session)), { signal });
    audio.src = audioUrl;

    this.start(session);
    return promise;
  }

  async start(session) {
    try {
      if (!session.timeline) await this.analyzer.attach(session.audio);
      if (session.settled) return;
      await session.audio.play();
      if (session.settled) return;
      this.onStart({ mode: this.mode });
      this.tick(session);
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        this.fail(session, new Error('El navegador bloqueó la reproducción: llama a play() desde un clic del usuario'));
      } else {
        this.fail(session, error);
      }
    }
  }

  tick(session) {
    if (session.settled) return;
    const { audio } = session;

    let viseme;
    if (audio.paused) viseme = 'REST';
    else if (session.timeline) viseme = visemeAt(session.timeline, audio.currentTime + this.leadTimeSec);
    else viseme = this.analyzer.getViseme(performance.now());

    this.emit(session, viseme);
    session.rafId = requestAnimationFrame(() => this.tick(session));
  }

  emit(session, viseme) {
    if (viseme === session.lastViseme) return;
    session.lastViseme = viseme;
    this.onViseme(viseme);
  }

  /** Vuelve al principio del audio actual; la boca se resincroniza sola. */
  restart() {
    const session = this.session;
    if (!session) return false;
    session.audio.currentTime = 0;
    if (session.audio.paused) session.audio.play().catch((error) => this.fail(session, error));
    return true;
  }

  stop() {
    if (this.session) this.finish(this.session, false);
  }

  finish(session, completed) {
    if (session.settled) return;
    this.cleanup(session);
    this.onViseme('REST');
    session.resolve({ completed });
  }

  fail(session, error) {
    if (session.settled) return;
    this.cleanup(session);
    this.onViseme('REST');
    session.reject(error instanceof Error ? error : new Error(String(error)));
  }

  cleanup(session) {
    session.settled = true;
    cancelAnimationFrame(session.rafId);
    session.controller.abort(); // quita todos los listeners del <audio>
    const { audio } = session;
    audio.pause();
    audio.removeAttribute('src');
    audio.load(); // libera el buffer/descarga
    if (!session.timeline) this.analyzer.detach();
    if (this.session === session) this.session = null;
  }

  mediaError(session) {
    const code = session.audio.error?.code;
    const reason = MEDIA_ERRORS[code] ?? 'error desconocido';
    return new Error(`No se pudo cargar el audio "${session.audioUrl}" (${reason})`);
  }

  async destroy() {
    this.stop();
    await this.analyzer.close();
  }
}
