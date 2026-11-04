import { avatarConfig as defaultConfig } from './avatarConfig.js';
import { LipSyncPlayer } from './LipSyncPlayer.js';
import { MouthRenderer } from './MouthRenderer.js';
import { EyelidRenderer } from './EyelidRenderer.js';
import { GazeRenderer } from './GazeRenderer.js';
import { IdleMotion } from './IdleMotion.js';
import { createSvgElement, uniqueIdPrefix } from './svg.js';
import {
  VISEMES,
  mouthShapes as defaultMouthShapes,
  expressionShapes as defaultExpressionShapes,
  visemeOpenness,
} from '../mouths/mouthShapes.js';

const STYLE_ELEMENT_ID = 'talking-avatar-styles';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const EXPRESSION_PREFIX = 'expression:';
const MOTION_EPSILON = 0.005;

// Duración aleatoria de cada visema en el modo "hablar sin audio" (setTalking).
const BABBLE_MIN_MS = 70;
const BABBLE_MAX_MS = 150;
const BABBLE_PAUSE_CHANCE = 0.12;
const BABBLE_PAUSE_MS = 220;
const BABBLE_SEQUENCE = ['AI', 'E', 'L', 'O', 'MBP', 'E', 'AI', 'U', 'L', 'FV', 'E', 'AI'];

const BASE_CSS = `
.ta-root { position: relative; width: 100%; overflow: hidden; isolation: isolate; contain: layout paint; }
.ta-stage, .ta-head, .ta-layer { position: absolute; inset: 0; width: 100%; height: 100%; }
.ta-stage, .ta-head { will-change: transform; }
.ta-layer { display: block; user-select: none; -webkit-user-drag: none; pointer-events: none; }
.ta-overlay { overflow: visible; }
`;

function injectBaseStyles() {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = BASE_CSS;
  document.head.append(style);
}

function createImage(src) {
  const img = document.createElement('img');
  img.className = 'ta-layer';
  img.src = src;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  return img;
}

/**
 * Avatar 2D con lip-sync.
 *
 * La ilustración original es la capa base; encima, un SVG con el mismo
 * sistema de coordenadas (viewBox = tamaño de la imagen) dibuja solo:
 * parche que oculta la boca original, la boca animada y los párpados.
 *
 * Eventos (EventTarget): 'visemechange' {viseme}, 'playstart' {mode},
 * 'playend' {completed}, 'error' {error}.
 */
export class TalkingAvatar extends EventTarget {
  /**
   * @param {object} options
   * @param {HTMLElement} options.element  contenedor; el avatar ocupa su ancho
   * @param {string} [options.image]        ruta de la ilustración (por defecto la de avatarConfig)
   * @param {object} [options.config]       sobrescribe partes de avatarConfig
   * @param {object} [options.mouthShapes]  visemas propios
   * @param {object} [options.expressionShapes]
   * @param {string} [options.label]        texto accesible
   */
  constructor({
    element,
    image,
    config = {},
    mouthShapes = defaultMouthShapes,
    expressionShapes = defaultExpressionShapes,
    label = 'Asistente virtual',
  }) {
    super();
    if (!(element instanceof HTMLElement)) throw new TypeError('TalkingAvatar: `element` debe ser un HTMLElement');

    this.element = element;
    this.config = mergeConfig(defaultConfig, config);
    this.imageSrc = image ?? this.config.image;
    this.expressions = Object.keys(expressionShapes);
    this.expression = 'neutral';
    this.viseme = 'REST';
    this.talking = false;
    this.babbleNextAt = 0;
    this.babbleIndex = 0;
    this.playToken = 0;
    this.rafId = 0;
    this.destroyed = false;
    this.lastMotion = { breathY: NaN, headAngle: NaN, headY: NaN };
    this.mouthPlacement = { ...this.config.mouth };

    injectBaseStyles();
    this.buildDom({ mouthShapes, expressionShapes, label });

    this.idle = new IdleMotion(this.config.motion);
    this.player = new LipSyncPlayer({
      leadTimeSec: this.config.lipSync.leadTimeSec,
      onViseme: (viseme) => this.showViseme(viseme),
      onStart: (detail) => this.dispatchEvent(new CustomEvent('playstart', { detail })),
    });

    this.reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    this.reducedMotion = this.reducedMotionQuery.matches;
    this.onReducedMotionChange = (event) => {
      this.reducedMotion = event.matches;
    };
    this.reducedMotionQuery.addEventListener('change', this.onReducedMotionChange);

    this.tick = this.tick.bind(this);
    this.rafId = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------- DOM

  buildDom({ mouthShapes, expressionShapes, label }) {
    const { originalWidth: W, originalHeight: H, colors, head, mouthMask } = this.config;
    const id = uniqueIdPrefix('talking-avatar-');

    this.root = document.createElement('div');
    this.root.className = 'ta-root';
    this.root.setAttribute('role', 'img');
    this.root.setAttribute('aria-label', label);
    this.root.style.aspectRatio = `${W} / ${H}`;
    this.root.style.backgroundColor = colors.background;

    this.stage = document.createElement('div');
    this.stage.className = 'ta-stage';

    // Capa 1: ilustración completa (cuerpo). Capa 2: la misma imagen recortada
    // por encima del cuello; es la que rota como "cabeza".
    this.bodyImage = createImage(this.imageSrc);
    this.headLayer = document.createElement('div');
    this.headLayer.className = 'ta-head';
    this.headLayer.style.clipPath = `inset(0 0 ${((1 - head.seamY / H) * 100).toFixed(3)}% 0)`;
    this.headLayer.style.transformOrigin = `${((head.pivotX / W) * 100).toFixed(3)}% ${((head.pivotY / H) * 100).toFixed(3)}%`;
    this.headImage = createImage(this.imageSrc);

    this.svg = createSvgElement('svg', {
      class: 'ta-layer ta-overlay',
      viewBox: `0 0 ${W} ${H}`,
      'aria-hidden': 'true',
      focusable: 'false',
    });
    const defs = createSvgElement('defs');

    const featherId = `${id}-feather`;
    const feather = createSvgElement('filter', {
      id: featherId,
      x: '-20%',
      y: '-20%',
      width: '140%',
      height: '140%',
      'color-interpolation-filters': 'sRGB',
    });
    feather.append(createSvgElement('feGaussianBlur', { stdDeviation: mouthMask.feather }));
    defs.append(feather);
    this.svg.append(defs);

    this.mouthMask = createSvgElement('rect', {
      class: 'ta-mouth-mask',
      x: mouthMask.x,
      y: mouthMask.y,
      width: mouthMask.width,
      height: mouthMask.height,
      rx: mouthMask.radius,
      fill: colors.skin,
      filter: `url(#${featherId})`,
    });
    this.svg.append(this.mouthMask);

    const shapes = { ...mouthShapes };
    for (const [name, shape] of Object.entries(expressionShapes)) shapes[EXPRESSION_PREFIX + name] = shape;
    this.mouth = new MouthRenderer({
      parent: this.svg,
      colors,
      shapes,
      initialShape: 'REST',
      transitionMs: this.config.lipSync.transitionMs,
    });
    this.mouth.setPlacement(this.mouthPlacement);

    const eyes = [this.config.leftEye, this.config.rightEye].filter(Boolean);
    // La mirada va debajo de los párpados para que el parpadeo la tape.
    this.gazes = eyes
      .filter((eye) => eye.pupil && eye.pupilForward && eye.lashBottom)
      .map((eye, index) => new GazeRenderer({ parent: this.svg, defs, eye, colors, id: `${id}-gaze${index}` }));
    this.setGaze(this.config.gaze);
    this.eyelids = eyes.map(
      (eye, index) => new EyelidRenderer({ parent: this.svg, defs, eye, colors, id: `${id}-eye${index}` }),
    );

    this.headLayer.append(this.headImage, this.svg);
    this.stage.append(this.bodyImage, this.headLayer);
    this.root.append(this.stage);
    this.element.append(this.root);

    this.onImageError = () => {
      this.dispatchEvent(
        new CustomEvent('error', { detail: { error: new Error(`No se pudo cargar la imagen "${this.imageSrc}"`) } }),
      );
    };
    this.bodyImage.addEventListener('error', this.onImageError);
  }

  // ---------------------------------------------------------------- API pública

  /** Muestra un visema (REST, MBP, AI, E, O, U, FV, L). */
  setViseme(viseme) {
    this.showViseme(viseme);
  }

  get currentViseme() {
    return this.viseme;
  }

  get isPlaying() {
    return this.player.isPlaying;
  }

  /**
   * Reproduce audio con lip-sync.
   * @param {string} audioUrl
   * @param {Array<{time:number, viseme:string}>} [visemeTimeline] si falta o está vacía → fallback por volumen
   * @returns {Promise<{completed:boolean}>}
   */
  async play(audioUrl, visemeTimeline = null) {
    const token = ++this.playToken;
    this.talking = true; // micro-movimiento de "hablando"; la boca la mueve el player, no el modo babble
    this.babbleNextAt = 0;
    try {
      const result = await this.player.play(audioUrl, visemeTimeline);
      if (token === this.playToken) this.dispatchEvent(new CustomEvent('playend', { detail: result }));
      return result;
    } catch (error) {
      if (token === this.playToken) this.dispatchEvent(new CustomEvent('error', { detail: { error } }));
      throw error;
    } finally {
      if (token === this.playToken) {
        this.talking = false;
        this.showViseme('REST');
      }
    }
  }

  stop() {
    this.player.stop();
    this.setTalking(false);
  }

  /** Reinicia el audio en curso desde el principio. */
  restart() {
    return this.player.restart();
  }

  /**
   * Activa la "actitud" de hablar. Si no hay audio reproduciéndose con
   * play(), además genera bocas aleatorias (útil si el audio lo reproduce
   * otra parte de la app y no tienes visemas). setTalking(false) vuelve a REST.
   */
  setTalking(talking) {
    this.talking = Boolean(talking);
    this.babbleNextAt = 0;
    if (!this.talking) this.showViseme('REST');
  }

  /** 'neutral' | 'happy' | 'serious' (o las que definas en expressionShapes). */
  setExpression(expression) {
    if (!this.expressions.includes(expression)) {
      throw new Error(`Expresión desconocida "${expression}". Disponibles: ${this.expressions.join(', ')}`);
    }
    this.expression = expression;
    if (this.viseme === 'REST') this.mouth.setTarget(this.shapeKey('REST'));
  }

  /** Calibración: mueve/escala la boca animada (px de la imagen original). */
  setMouthPlacement(placement) {
    this.mouthPlacement = { ...this.mouthPlacement, ...placement };
    this.mouth.setPlacement(this.mouthPlacement);
  }

  getMouthPlacement() {
    return { ...this.mouthPlacement };
  }

  /** Depuración: ocultar el parche (ver la boca original) y/o hacer translúcida la boca SVG. */
  setDebug({ maskVisible, mouthOpacity } = {}) {
    if (maskVisible !== undefined) this.mouthMask.setAttribute('visibility', maskVisible ? 'visible' : 'hidden');
    if (mouthOpacity !== undefined) this.mouth.setOpacity(mouthOpacity);
  }

  blink() {
    this.idle.blinkNow();
  }

  /** 'forward': mira al frente (al candidato) | 'original': como en la ilustración. */
  setGaze(gaze) {
    if (gaze !== 'forward' && gaze !== 'original') {
      throw new Error(`Mirada desconocida "${gaze}". Usa 'forward' u 'original'`);
    }
    this.gaze = gaze;
    this.gazes.forEach((renderer) => renderer.setGaze(gaze));
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playToken += 1;
    cancelAnimationFrame(this.rafId);
    this.player.destroy();
    this.reducedMotionQuery.removeEventListener('change', this.onReducedMotionChange);
    this.bodyImage.removeEventListener('error', this.onImageError);
    this.mouth.destroy();
    this.gazes.forEach((renderer) => renderer.destroy());
    this.eyelids.forEach((eyelid) => eyelid.destroy());
    this.root.remove();
  }

  // ---------------------------------------------------------------- interno

  shapeKey(viseme) {
    return viseme === 'REST' ? EXPRESSION_PREFIX + this.expression : viseme;
  }

  showViseme(viseme) {
    let next = viseme;
    if (!VISEMES.includes(next) || !this.mouth.has(next)) {
      console.warn(`TalkingAvatar: visema desconocido "${viseme}", se usa REST`);
      next = 'REST';
    }
    this.mouth.setTarget(this.shapeKey(next));
    if (next !== this.viseme) {
      this.viseme = next;
      this.dispatchEvent(new CustomEvent('visemechange', { detail: { viseme: next } }));
    }
  }

  updateBabble(now) {
    if (!this.talking || this.player.isPlaying || now < this.babbleNextAt) return;
    if (Math.random() < BABBLE_PAUSE_CHANCE) {
      this.showViseme('REST');
      this.babbleNextAt = now + BABBLE_PAUSE_MS;
      return;
    }
    this.babbleIndex = (this.babbleIndex + 1 + Math.floor(Math.random() * 3)) % BABBLE_SEQUENCE.length;
    this.showViseme(BABBLE_SEQUENCE[this.babbleIndex]);
    this.babbleNextAt = now + BABBLE_MIN_MS + Math.random() * (BABBLE_MAX_MS - BABBLE_MIN_MS);
  }

  tick(now) {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.tick);

    this.updateBabble(now);
    this.mouth.update(now);

    const motion = this.idle.update(now, {
      talking: this.talking,
      openness: visemeOpenness[this.viseme] ?? 0,
      reducedMotion: this.reducedMotion,
    });
    this.eyelids.forEach((eyelid) => eyelid.render(motion.blink));
    this.applyMotion(motion);
  }

  applyMotion({ breathY, headAngle, headY }) {
    const last = this.lastMotion;
    if (Math.abs(breathY - last.breathY) > MOTION_EPSILON || Number.isNaN(last.breathY)) {
      this.stage.style.transform = `translate3d(0, ${breathY.toFixed(3)}px, 0)`;
      last.breathY = breathY;
    }
    if (
      Math.abs(headAngle - last.headAngle) > MOTION_EPSILON / 10 ||
      Math.abs(headY - last.headY) > MOTION_EPSILON ||
      Number.isNaN(last.headAngle)
    ) {
      this.headLayer.style.transform = `translate3d(0, ${headY.toFixed(3)}px, 0) rotate(${headAngle.toFixed(4)}deg)`;
      last.headAngle = headAngle;
      last.headY = headY;
    }
  }
}

/** Mezcla superficial por secciones (mouth, colors, motion…). */
function mergeConfig(base, overrides) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const isPlainObject = value && typeof value === 'object' && !Array.isArray(value);
    result[key] = isPlainObject && base[key] ? { ...base[key], ...value } : value;
  }
  return result;
}
