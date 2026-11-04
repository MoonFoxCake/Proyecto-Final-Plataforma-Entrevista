/**
 * Configuración visual del avatar.
 *
 * TODAS las coordenadas están en píxeles de la imagen original
 * (assets/avatar-reference.png, 1254 × 1254). El overlay SVG usa ese mismo
 * sistema como viewBox, así que todo escala solo cuando cambia el tamaño
 * del avatar en pantalla.
 */
export const avatarConfig = {
  image: new URL('../assets/avatar-reference.png', import.meta.url).href,
  originalWidth: 1254,
  originalHeight: 1254,

  // Paleta muestreada de la ilustración.
  colors: {
    background: '#F3ECDA', // papel del fondo
    skin: '#F6EDDB',       // piel alrededor de la boca
    eyeSkin: '#F6EEDC',    // piel detrás de las gafas
    navy: '#11366B',       // pelo, pupilas, trazos
    lip: '#E04949',        // labio y mejillas
    teeth: '#FFFAF0',
  },

  // Boca animada. (x, y) = CENTRO de la boca.
  // width/height iguales a MOUTH_DESIGN_SIZE (mouths/mouthShapes.js) dibujan
  // la boca 1:1 con la original; `scale` multiplica ambos.
  mouth: { x: 626, y: 608, width: 128, height: 48, scale: 1 },

  // Parche color piel que oculta la boca original.
  // (x, y) = esquina superior izquierda. No se mueve al calibrar la boca:
  // siempre tapa la boca pintada en la imagen.
  mouthMask: { x: 557, y: 582, width: 140, height: 52, radius: 10, feather: 1.4 },

  // Mirada por defecto: 'forward' (al frente, al candidato) | 'original' (como en la ilustración).
  gaze: 'forward',

  // Ojos.
  // Parpadeo: (x, y, width, height) = elipse que cubre pestaña + pupila.
  //   lidOpen/lidClosed = curva cuadrática del párpado: [exterior, control, interior].
  // Mirada: `pupil` = pupila tal como está dibujada (mira hacia la derecha de la imagen);
  //   `pupilForward` = su centro para mirar al frente, calcado de la versión de referencia con
  //   mirada frontal (superpuesta a esta imagen, error < 0.5 px): bajo el punto más alto de la
  //   pestaña. Moverla hacia el centro del ojo (rabillo incluido) la separa y se ve mal.
  //   `lashBottom` = borde inferior de la pestaña sobre la pupila original: el parche que
  //   la tapa no sube de esta línea.
  leftEye: {
    x: 518, y: 458, width: 108, height: 74,
    lidOpen: [[472, 450], [544, 416], [564, 450]],
    lidClosed: [[474, 468], [520, 488], [565, 470]],
    pupil: { x: 545.5, y: 461.5, rx: 17.2, ry: 24 },
    pupilForward: { x: 527, y: 461.5 },
    lashBottom: [
      [522, 439.5], [536, 438.5], [540, 438.8], [544, 439.3], [548, 440.1], [552, 442.3],
      [556, 444.6], [560, 448.9], [562, 451.5], [564, 453.4], [566, 455.1], [570, 456],
    ],
  },
  rightEye: {
    x: 733, y: 456, width: 104, height: 70,
    lidOpen: [[778, 442], [735, 412], [685, 455]],
    lidClosed: [[777, 464], [730, 488], [684, 468]],
    pupil: { x: 737.5, y: 460, rx: 17.8, ry: 24.5 },
    pupilForward: { x: 723.5, y: 461 },
    lashBottom: [
      [714, 439.2], [726, 438], [730, 438.6], [734, 439.7], [738, 441.1], [742, 442],
      [746, 444], [750, 446.5], [754, 449.1], [756, 451], [760, 452.3], [762, 451.5],
    ],
  },

  // La cabeza es una copia de la imagen recortada por encima de `seamY`.
  // Esa línea sólo cruza fondo y cuello, así que al rotar ±1° no se ve la unión.
  head: { seamY: 775, pivotX: 642, pivotY: 775 },

  motion: {
    breathingAmplitudePx: 1.5,
    breathingPeriodMs: 4800,
    headSwayIdleDeg: 0.35,
    headSwayTalkingDeg: 0.75,
    headEmphasisDeg: 0.2,     // inclinación extra según apertura de la boca
    headMaxDeg: 1,
    headNodPx: 0.6,
    talkingEaseMs: 450,
    blinkIntervalMs: [3000, 6000],
    blinkCloseMs: 70,
    blinkHoldMs: 45,
    blinkOpenMs: 95,
    doubleBlinkChance: 0.12,
  },

  lipSync: {
    transitionMs: 90,   // morphing entre visemas
    leadTimeSec: 0.04,  // la boca se adelanta un poco al audio: se percibe más sincronizado
  },
};
