import { createSvgElement } from './svg.js';
import { MOUTH_DESIGN_SIZE, MOUTH_STYLE } from '../mouths/mouthShapes.js';

const PATH_LAYERS = ['lip', 'cavity', 'teeth', 'cornerLeft', 'cornerRight'];
const FILL_LAYERS = ['lip', 'cavity', 'teeth'];
const CORNER_LAYERS = ['cornerLeft', 'cornerRight'];
const NUMBER_PATTERN = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const PRECISION = 100; // 2 decimales al escribir los `d`
const CORNER_SEGMENTS = 14;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const smoothstep = (t) => t * t * (3 - 2 * t);
const round = (n) => Math.round(n * PRECISION) / PRECISION;

function cornerWidth(t, style) {
  if (t <= style.cornerTaperStart) {
    const k = t / style.cornerTaperStart;
    return style.cornerWidthOuter + (style.cornerWidthInner - style.cornerWidthOuter) * k;
  }
  const k = smoothstep((t - style.cornerTaperStart) / (1 - style.cornerTaperStart));
  return style.cornerWidthInner + (style.cornerWidthTip - style.cornerWidthInner) * k;
}

/**
 * Contorno relleno de un trazo afilado a lo largo de la cuadrática
 * (x0,y0)–(cx,cy)–(x1,y1): punta redondeada en el inicio, afilada al final.
 */
function taperedStrokePath(values, offset, style) {
  const [x0, y0, cx, cy, x1, y1] = values.subarray(offset, offset + 6);
  const left = [];
  const right = [];
  let startTangent = null;

  for (let i = 0; i <= CORNER_SEGMENTS; i += 1) {
    const t = i / CORNER_SEGMENTS;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    let tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
    let ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    if (i === 0) startTangent = [tx, ty];
    const half = cornerWidth(t, style) / 2;
    left.push(`${round(x - ty * half)},${round(y + tx * half)}`);
    right.push(`${round(x + ty * half)},${round(y - tx * half)}`);
  }

  // Punta redondeada: cuadrática cuyo vértice queda a media anchura por detrás del inicio.
  const capReach = style.cornerWidthOuter;
  const cap = `${round(x0 - startTangent[0] * capReach)},${round(y0 - startTangent[1] * capReach)}`;
  return `M${right[0]} Q${cap} ${left[0]} L${left.slice(1).join(' ')} L${right.slice(1).reverse().join(' ')} Z`;
}

function parsePath(d) {
  const values = (d.match(NUMBER_PATTERN) ?? []).map(Number);
  const parts = d.split(NUMBER_PATTERN);
  // Comandos + número de valores; ignora espacios y comas.
  const signature = parts.join('#').replace(/[\s,]+/g, '');
  return { parts, values, signature };
}

/**
 * Convierte una forma { lip: 'M…', …, cornerOpacity } en un vector plano de
 * números, para poder interpolar todas las capas a la vez.
 */
function compileShape(name, shape, template) {
  const values = [];
  const layers = PATH_LAYERS.map((layer, index) => {
    if (typeof shape[layer] !== 'string') {
      throw new Error(`mouthShapes.${name}: falta la capa "${layer}"`);
    }
    const parsed = parsePath(shape[layer]);
    if (CORNER_LAYERS.includes(layer) && parsed.signature !== 'M##Q####') {
      throw new Error(`mouthShapes.${name}.${layer} debe ser una cuadrática "M x,y Q cx,cy x,y"`);
    }
    if (template && parsed.signature !== template.layers[index].signature) {
      throw new Error(
        `mouthShapes.${name}.${layer} no tiene la misma estructura de comandos que REST; ` +
          'no se puede interpolar. Usa la misma secuencia de comandos en todos los visemas.',
      );
    }
    const offset = values.length;
    values.push(...parsed.values);
    return { parts: parsed.parts, signature: parsed.signature, offset, count: parsed.values.length };
  });
  values.push(shape.cornerOpacity ?? 1);
  return { layers, values: Float64Array.from(values) };
}

function buildPath(layer, values) {
  const { parts, offset } = layer;
  let d = parts[0];
  for (let i = 0; i < parts.length - 1; i += 1) {
    d += round(values[offset + i]) + parts[i + 1];
  }
  return d;
}

/**
 * Dibuja la boca y hace morphing entre formas.
 * La transición es por tiempo (no por frames) con ease-out: la boca reacciona
 * de inmediato y se asienta en `transitionMs`.
 */
export class MouthRenderer {
  constructor({ parent, colors, shapes, initialShape = 'REST', transitionMs = 90 }) {
    this.transitionMs = transitionMs;
    this.shapes = new Map();

    const template = compileShape(initialShape, shapes[initialShape]);
    for (const [name, shape] of Object.entries(shapes)) {
      this.shapes.set(name, compileShape(name, shape, template));
    }
    this.template = template;

    this.group = createSvgElement('g', { class: 'ta-mouth' });
    const fill = (color) => ({ fill: color, stroke: 'none' });
    this.paths = {
      lip: createSvgElement('path', { class: 'ta-mouth-lip', ...fill(colors.lip) }),
      cavity: createSvgElement('path', { class: 'ta-mouth-cavity', ...fill(colors.navy) }),
      teeth: createSvgElement('path', { class: 'ta-mouth-teeth', ...fill(colors.teeth) }),
      cornerLeft: createSvgElement('path', { class: 'ta-mouth-corner', ...fill(colors.navy) }),
      cornerRight: createSvgElement('path', { class: 'ta-mouth-corner', ...fill(colors.navy) }),
    };
    this.corners = createSvgElement('g', { class: 'ta-mouth-corners' });
    this.corners.append(this.paths.cornerLeft, this.paths.cornerRight);
    this.group.append(this.paths.lip, this.paths.cavity, this.paths.teeth, this.corners);
    parent.append(this.group);

    const initial = this.shapes.get(initialShape).values;
    this.current = Float64Array.from(initial);
    this.from = Float64Array.from(initial);
    this.to = initial;
    this.targetName = initialShape;
    this.transitionStart = 0;
    this.animating = false;
    this.render();
  }

  has(name) {
    return this.shapes.has(name);
  }

  /** Inicia la transición hacia `name` desde la forma que se ve AHORA (aunque esté a medio camino). */
  setTarget(name, now = performance.now()) {
    const target = this.shapes.get(name);
    if (!target) throw new Error(`Forma de boca desconocida: "${name}"`);
    if (name === this.targetName) return;

    this.targetName = name;
    this.from.set(this.current);
    this.to = target.values;
    this.transitionStart = now;
    this.animating = true;

    if (this.transitionMs <= 0) this.update(now);
  }

  /** Avanza la interpolación. Devuelve true mientras sigue animando. */
  update(now) {
    if (!this.animating) return false;

    const t = this.transitionMs > 0 ? Math.min(1, (now - this.transitionStart) / this.transitionMs) : 1;
    const k = easeOutCubic(Math.max(0, t));
    for (let i = 0; i < this.current.length; i += 1) {
      this.current[i] = this.from[i] + (this.to[i] - this.from[i]) * k;
    }
    this.render();
    if (t >= 1) this.animating = false;
    return this.animating;
  }

  render() {
    const { layers } = this.template;
    PATH_LAYERS.forEach((name, index) => {
      const d = FILL_LAYERS.includes(name)
        ? buildPath(layers[index], this.current)
        : taperedStrokePath(this.current, layers[index].offset, MOUTH_STYLE);
      this.paths[name].setAttribute('d', d);
    });
    const opacity = this.current[this.current.length - 1];
    this.corners.setAttribute('opacity', Math.max(0, Math.min(1, opacity)).toFixed(3));
  }

  /** Coloca la boca: (x, y) centro en px de la imagen; width/height/scale en px de la imagen. */
  setPlacement({ x, y, width = MOUTH_DESIGN_SIZE.width, height = MOUTH_DESIGN_SIZE.height, scale = 1 }) {
    const sx = (width / MOUTH_DESIGN_SIZE.width) * scale;
    const sy = (height / MOUTH_DESIGN_SIZE.height) * scale;
    this.group.setAttribute('transform', `translate(${x} ${y}) scale(${sx} ${sy})`);
  }

  setOpacity(opacity) {
    this.group.setAttribute('opacity', String(opacity));
  }

  destroy() {
    this.group.remove();
    this.shapes.clear();
  }
}
