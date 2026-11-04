import { createSvgElement } from './svg.js';

const LID_STROKE_OPEN = 8;     // ≈ grosor de la pestaña original
const LID_STROKE_CLOSED = 4.5;
const LID_COVER_BELOW = 12;    // con el ojo cerrado el parche también tapa la parte baja de la pupila
const FLICK_LENGTH = 9;
const FLICK_RISE = 5;
const FLICK_STROKE = 3.5;
const CLIP_MARGIN = 2;

const lerp = (a, b, t) => a + (b - a) * t;
const lerpPoint = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const fmt = (n) => Math.round(n * 100) / 100;

/**
 * Párpado de un ojo: un parche color piel que baja desde arriba recortado a la
 * elipse del ojo, más la línea del párpado (azul marino) en su borde.
 * progress 0 = abierto (no se dibuja nada, se ve la ilustración), 1 = cerrado.
 */
export class EyelidRenderer {
  constructor({ parent, defs, eye, colors, id }) {
    this.eye = eye;
    this.direction = Math.sign(eye.lidOpen[2][0] - eye.lidOpen[0][0]) || 1; // +1: el extremo exterior está a la izquierda
    this.lastProgress = -1;

    const clipId = `${id}-clip`;
    const clip = createSvgElement('clipPath', { id: clipId });
    clip.append(
      createSvgElement('ellipse', {
        cx: eye.x,
        cy: eye.y,
        rx: eye.width / 2,
        ry: eye.height / 2,
      }),
    );
    defs.append(clip);
    this.clip = clip;

    this.group = createSvgElement('g', { class: 'ta-eyelid', visibility: 'hidden' });
    this.patch = createSvgElement('path', { fill: colors.eyeSkin, 'clip-path': `url(#${clipId})` });
    this.line = createSvgElement('path', {
      fill: 'none',
      stroke: colors.navy,
      'stroke-linecap': 'round',
    });
    this.flick = createSvgElement('path', {
      fill: 'none',
      stroke: colors.navy,
      'stroke-width': FLICK_STROKE,
      'stroke-linecap': 'round',
    });
    this.group.append(this.patch, this.line, this.flick);
    parent.append(this.group);
  }

  render(progress) {
    const p = Math.max(0, Math.min(1, progress));
    if (Math.abs(p - this.lastProgress) < 0.002) return;
    this.lastProgress = p;

    if (p <= 0.001) {
      this.group.setAttribute('visibility', 'hidden');
      return;
    }
    this.group.setAttribute('visibility', 'visible');

    const { eye, direction } = this;
    const [outer, control, inner] = eye.lidOpen.map((point, i) => lerpPoint(point, eye.lidClosed[i], p));
    const cover = LID_COVER_BELOW * p;
    const top = eye.y - eye.height / 2 - CLIP_MARGIN;
    const outerEdge = eye.x - direction * (eye.width / 2 + CLIP_MARGIN);
    const innerEdge = eye.x + direction * (eye.width / 2 + CLIP_MARGIN);

    this.patch.setAttribute(
      'd',
      `M${fmt(outerEdge)},${fmt(outer[1] + cover)} L${fmt(outer[0])},${fmt(outer[1] + cover)} ` +
        `Q${fmt(control[0])},${fmt(control[1] + cover)} ${fmt(inner[0])},${fmt(inner[1] + cover)} ` +
        `L${fmt(innerEdge)},${fmt(inner[1] + cover)} L${fmt(innerEdge)},${fmt(top)} L${fmt(outerEdge)},${fmt(top)} Z`,
    );

    this.line.setAttribute(
      'd',
      `M${fmt(outer[0])},${fmt(outer[1])} Q${fmt(control[0])},${fmt(control[1])} ${fmt(inner[0])},${fmt(inner[1])}`,
    );
    this.line.setAttribute('stroke-width', fmt(lerp(LID_STROKE_OPEN, LID_STROKE_CLOSED, p)));

    // Pequeño "rabillo" de delineado en el extremo exterior, como en el ojo
    // original; crece a medida que se cierra el párpado.
    this.flick.setAttribute(
      'd',
      `M${fmt(outer[0])},${fmt(outer[1])} ` +
        `L${fmt(outer[0] - direction * FLICK_LENGTH * p)},${fmt(outer[1] - FLICK_RISE * p)}`,
    );
  }

  destroy() {
    this.group.remove();
    this.clip.remove();
  }
}
