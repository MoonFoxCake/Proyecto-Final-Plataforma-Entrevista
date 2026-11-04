import { createSvgElement } from './svg.js';

const PATCH_MARGIN = 3.5;   // cubre también el halo de compresión (claro + oscuro) de la pupila original
const PATCH_FEATHER = 1;    // borde suave; el recorte por la pestaña se aplica después y queda nítido
const CLIP_BOTTOM_PAD = 40;

/**
 * Dirección de la mirada de un ojo.
 *
 * 'forward': tapa la pupila de la ilustración con piel (sin pasar del borde
 * inferior de la pestaña) y dibuja la pupila centrada, mirando al espectador.
 * 'original': no dibuja nada; se ve la pupila tal como está en la imagen.
 */
export class GazeRenderer {
  constructor({ parent, defs, eye, colors, id }) {
    const { pupil, pupilForward, lashBottom } = eye;

    // Zona por debajo de la pestaña: el parche nunca la invade.
    const clipId = `${id}-below-lash`;
    const first = lashBottom[0];
    const last = lashBottom[lashBottom.length - 1];
    const bottom = pupil.y + pupil.ry + CLIP_BOTTOM_PAD;
    const outline = lashBottom.map(([x, y]) => `${x},${y}`).join(' L');
    this.clip = createSvgElement('clipPath', { id: clipId });
    this.clip.append(createSvgElement('path', { d: `M${outline} L${last[0]},${bottom} L${first[0]},${bottom} Z` }));
    const featherId = `${id}-feather`;
    this.feather = createSvgElement('filter', { id: featherId, x: '-20%', y: '-20%', width: '140%', height: '140%' });
    this.feather.append(createSvgElement('feGaussianBlur', { stdDeviation: PATCH_FEATHER }));
    defs.append(this.clip, this.feather);

    this.group = createSvgElement('g', { class: 'ta-gaze' });
    this.patch = createSvgElement('ellipse', {
      cx: pupil.x,
      cy: pupil.y,
      rx: pupil.rx + PATCH_MARGIN,
      ry: pupil.ry + PATCH_MARGIN,
      fill: colors.eyeSkin,
      filter: `url(#${featherId})`,
      'clip-path': `url(#${clipId})`,
    });
    // Misma pupila (forma y tamaño), desplazada. Su parte alta queda dentro de la pestaña.
    this.pupil = createSvgElement('ellipse', {
      cx: pupilForward.x,
      cy: pupilForward.y,
      rx: pupil.rx,
      ry: pupil.ry,
      fill: colors.navy,
    });
    this.group.append(this.patch, this.pupil);
    parent.append(this.group);
  }

  setGaze(gaze) {
    this.group.setAttribute('visibility', gaze === 'forward' ? 'visible' : 'hidden');
  }

  destroy() {
    this.group.remove();
    this.clip.remove();
    this.feather.remove();
  }
}
