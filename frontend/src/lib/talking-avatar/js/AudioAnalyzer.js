/**
 * FALLBACK VISUAL basado en volumen.
 *
 * ⚠ Esto NO es lip-sync fonético: solo mide la energía (RMS) del audio y
 * elige una boca más o menos abierta. Sirve cuando hay audio pero no hay
 * timeline de visemas. Si existe timeline, LipSyncPlayer la usa siempre.
 *
 *   silencio      → REST
 *   volumen bajo  → E
 *   volumen medio → AI
 *   volumen alto  → O
 *
 * El "volumen" es el RMS normalizado al pico reciente y multiplicado por su
 * contraste con una envolvente lenta, para que la boca se abra en los picos
 * de sílaba y se cierre entre ellas aunque el volumen medio sea estable.
 */

const DEFAULTS = {
  fftSize: 1024,
  silenceRms: 0.012,   // por debajo: silencio absoluto
  // Umbrales sobre la puntuación de apertura (0–1).
  lowThreshold: 0.16,
  midThreshold: 0.4,
  highThreshold: 0.72,
  peakDecayPerSec: 0.35, // el pico de referencia baja poco a poco: se adapta a audios flojos o fuertes
  peakFloor: 0.05,
  envelopeMs: 250,       // envolvente lenta: el contraste con ella marca los picos de sílaba
  minHoldMs: 70,         // tiempo mínimo en un visema: evita parpadeo de bocas
  maxHoldMs: 260,        // con volumen muy estable, cierra un instante para no "congelar" la boca
};

// Si un visema dura demasiado, se alterna con uno algo más cerrado.
const SOFTER = { O: 'AI', AI: 'E', E: 'MBP', MBP: 'E' };

export class AudioAnalyzer {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.samples = null;
    this.peak = this.options.peakFloor;
    this.envelope = 0;
    this.lastViseme = 'REST';
    this.lastChange = 0;
    this.lastSampleTime = null;
  }

  /**
   * Conecta un <audio>: elemento → analyser → altavoces.
   * Un HTMLMediaElement solo se puede conectar una vez a Web Audio, así que
   * LipSyncPlayer crea un elemento nuevo por reproducción.
   * Para audio de otro dominio, el servidor debe enviar CORS y el elemento
   * llevar crossOrigin="anonymous"; si no, el navegador entrega silencio.
   */
  async attach(mediaElement) {
    this.detach();
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio API no disponible en este navegador');
      this.context = new AudioContextClass();
    }
    if (this.context.state === 'suspended') await this.context.resume();

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.options.fftSize;
    this.analyser.smoothingTimeConstant = 0;
    this.samples = new Float32Array(this.analyser.fftSize);

    this.source = this.context.createMediaElementSource(mediaElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    this.peak = this.options.peakFloor;
    this.envelope = 0;
    this.lastViseme = 'REST';
    this.lastChange = 0;
    this.lastSampleTime = null;
  }

  detach() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
  }

  /** RMS instantáneo (0–1). */
  getLevel() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (let i = 0; i < this.samples.length; i += 1) sum += this.samples[i] * this.samples[i];
    return Math.sqrt(sum / this.samples.length);
  }

  getViseme(now = performance.now()) {
    const o = this.options;
    const rms = this.getLevel();

    const dtMs = this.lastSampleTime === null ? 0 : now - this.lastSampleTime;
    this.lastSampleTime = now;
    this.peak = Math.max(rms, o.peakFloor, this.peak - o.peakDecayPerSec * this.peak * (dtMs / 1000));
    this.envelope += (rms - this.envelope) * (1 - Math.exp(-dtMs / o.envelopeMs));

    let viseme;
    if (rms < o.silenceRms) {
      viseme = 'REST';
    } else {
      // Nivel absoluto (respecto al pico) × contraste con la envolvente lenta:
      // sube en los picos de sílaba y baja entre ellas.
      const level = rms / this.peak;
      const contrast = Math.min(1.3, Math.max(0.5, rms / Math.max(this.envelope, 1e-4)));
      const score = level * contrast;
      if (score < o.lowThreshold) viseme = 'REST';
      else if (score < o.midThreshold) viseme = 'E';
      else if (score < o.highThreshold) viseme = 'AI';
      else viseme = 'O';
    }

    const held = now - this.lastChange;
    if (viseme === this.lastViseme && viseme !== 'REST' && held > o.maxHoldMs) {
      viseme = SOFTER[viseme] ?? 'REST';
    }
    if (viseme !== this.lastViseme && held >= o.minHoldMs) {
      this.lastViseme = viseme;
      this.lastChange = now;
    }
    return this.lastViseme;
  }

  async close() {
    this.detach();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close();
  }
}
