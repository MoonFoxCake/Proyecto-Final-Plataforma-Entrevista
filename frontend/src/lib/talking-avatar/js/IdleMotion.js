const TWO_PI = Math.PI * 2;
const OPENNESS_EASE_MS = 120;
const MAX_STEP_MS = 100;
const DOUBLE_BLINK_GAP_MS = 140;

// Periodos irracionales entre sí para que el balanceo nunca se vea en bucle.
const SWAY_PERIOD_A_MS = 7100;
const SWAY_PERIOD_B_MS = 3900;
const SWAY_PHASE_B = 1.7;

const smoothstep = (t) => t * t * (3 - 2 * t);

/** Acerca `current` a `target` con una constante de tiempo, independiente del framerate. */
function approach(current, target, dtMs, timeConstantMs) {
  if (timeConstantMs <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dtMs / timeConstantMs));
}

/**
 * Micro-animaciones: parpadeo, respiración y balanceo de cabeza.
 * Es solo cálculo (no toca el DOM): TalkingAvatar aplica los valores.
 */
export class IdleMotion {
  constructor(motion, random = Math.random) {
    this.motion = motion;
    this.random = random;
    this.talkLevel = 0;
    this.openness = 0;
    this.lastNow = null;
    this.blinkStart = null;
    this.nextBlinkAt = null;
  }

  update(now, { talking = false, openness = 0, reducedMotion = false } = {}) {
    const m = this.motion;
    // Acotado: tras una pestaña en segundo plano (o relojes no monótonos) no hay saltos.
    const dt = this.lastNow === null ? 0 : Math.min(MAX_STEP_MS, Math.max(0, now - this.lastNow));
    this.lastNow = now;

    this.talkLevel = approach(this.talkLevel, talking ? 1 : 0, dt, m.talkingEaseMs);
    this.openness = approach(this.openness, openness, dt, OPENNESS_EASE_MS);

    const blink = this.updateBlink(now);

    if (reducedMotion) {
      return { blink, breathY: 0, headAngle: 0, headY: 0 };
    }

    const breathPhase = (now % m.breathingPeriodMs) / m.breathingPeriodMs;
    const breathY = -m.breathingAmplitudePx * (0.5 - 0.5 * Math.cos(TWO_PI * breathPhase));

    const wave =
      0.65 * Math.sin((TWO_PI * now) / SWAY_PERIOD_A_MS) +
      0.35 * Math.sin((TWO_PI * now) / SWAY_PERIOD_B_MS + SWAY_PHASE_B);
    const swayDeg = m.headSwayIdleDeg + (m.headSwayTalkingDeg - m.headSwayIdleDeg) * this.talkLevel;
    const emphasis = m.headEmphasisDeg * this.openness * this.talkLevel;
    const headAngle = Math.max(-m.headMaxDeg, Math.min(m.headMaxDeg, swayDeg * wave + emphasis));
    const headY = m.headNodPx * this.openness * this.talkLevel;

    return { blink, breathY, headAngle, headY };
  }

  /** Devuelve el cierre del párpado (0 abierto – 1 cerrado). */
  updateBlink(now) {
    const m = this.motion;
    if (this.nextBlinkAt === null) this.nextBlinkAt = now + this.randomInterval();

    if (this.blinkStart === null) {
      if (now < this.nextBlinkAt) return 0;
      this.blinkStart = now;
    }

    const t = now - this.blinkStart;
    if (t < m.blinkCloseMs) return smoothstep(t / m.blinkCloseMs);
    if (t < m.blinkCloseMs + m.blinkHoldMs) return 1;
    const openT = t - m.blinkCloseMs - m.blinkHoldMs;
    if (openT < m.blinkOpenMs) return 1 - smoothstep(openT / m.blinkOpenMs);

    this.blinkStart = null;
    this.nextBlinkAt =
      now + (this.random() < m.doubleBlinkChance ? DOUBLE_BLINK_GAP_MS : this.randomInterval());
    return 0;
  }

  /** Fuerza un parpadeo inmediato (útil para depurar). */
  blinkNow(now = performance.now()) {
    this.nextBlinkAt = now;
  }

  randomInterval() {
    const [min, max] = this.motion.blinkIntervalMs;
    return min + this.random() * (max - min);
  }
}
