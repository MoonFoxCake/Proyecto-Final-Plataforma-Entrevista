/**
 * Formas de boca (visemas) en SVG.
 *
 * Coordenadas: píxeles de la imagen original con el origen (0,0) en el centro
 * de la boca (avatarConfig.mouth.x / y). Con la configuración por defecto la
 * boca se dibuja 1:1 sobre la ilustración. REST está calcada de la boca
 * original (ajuste por mínimos cuadrados, error medio < 0.7 px).
 *
 * Capas, de abajo arriba:
 *   lip          relleno coral       labio inferior / silueta de la boca
 *   cavity       relleno azul marino interior de la boca abierta
 *   teeth        relleno crema       dientes superiores
 *   cornerLeft   línea central de la comisura izquierda: M exterior Q control interior
 *   cornerRight  ídem derecha. Se dibujan como trazo afilado (grueso fuera, en
 *                punta dentro), igual que en la ilustración: ver MOUTH_STYLE.
 *
 * REGLA PARA EL MORPHING
 * Cada capa usa la MISMA secuencia de comandos en todos los visemas
 * (rellenos: M C C Z, comisuras: M Q). Así la transición interpola número a
 * número sin librerías. Una capa que no se ve en un visema se dibuja
 * degenerada (ida y vuelta por la misma curva, área cero) justo donde debe
 * aparecer; p. ej. en REST la cavidad y los dientes son una línea sobre el
 * borde superior del labio y "se abren" desde ahí.
 * En los bordes de la familia "sonrisa" los puntos de control están en los
 * tercios horizontales del borde; así las formas intermedias no hacen ondas.
 */

export const MOUTH_DESIGN_SIZE = { width: 128, height: 48 };

export const MOUTH_STYLE = {
  cornerWidthOuter: 3.2, // px de la imagen, en el extremo exterior (punta redondeada)
  cornerWidthInner: 2.4,
  cornerWidthTip: 0.4,   // extremo interior, afilado
  cornerTaperStart: 0.72, // fracción de la línea donde empieza a afilarse
};

export const VISEMES = ['REST', 'MBP', 'AI', 'E', 'O', 'U', 'FV', 'L'];

export const mouthShapes = {
  // Silencio: la sonrisa original de la ilustración.
  REST: {
    lip: 'M-51,-4.5 C-18,2.5 15,-3.5 48,-8.5 C15,29.5 -18,29 -51,-4.5 Z',
    cavity: 'M-51,-4.5 C-18,2.5 15,-3.5 48,-8.5 C15,-3.5 -18,2.5 -51,-4.5 Z',
    teeth: 'M-38,-1.5 C-13.5,1.5 10.5,-2 35,-5.5 C10.5,-2 -13.5,1.5 -38,-1.5 Z',
    cornerLeft: 'M-59,-10.5 Q-46.5,0 -30.5,2.5',
    cornerRight: 'M59,-18.5 Q44,-4.5 27,-2',
    cornerOpacity: 1,
  },

  // M, B, P: labios apretados. Más estrecha y fina, con la línea de cierre.
  MBP: {
    lip: 'M-45,-3.5 C-16,2 13,-3 42,-7 C13,13.5 -16,13.5 -45,-3.5 Z',
    cavity: 'M-45,-3.5 C-16,2 13,-3 42,-7 C13,-1 -16,4.5 -45,-3.5 Z',
    teeth: 'M-33.5,-1 C-12,1.5 9,-1.5 30.5,-4.5 C9,-1.5 -12,1.5 -33.5,-1 Z',
    cornerLeft: 'M-52,-8.5 Q-41,0.5 -27.5,2.5',
    cornerRight: 'M51.5,-15.5 Q38.5,-3.5 24,-1.5',
    cornerOpacity: 1,
  },

  // A, I: abierta en horizontal.
  AI: {
    lip: 'M-47,-6 C-16.5,-0.5 14.5,-6 45,-10 C14.5,39 -16.5,38.5 -47,-6 Z',
    cavity: 'M-47,-6 C-16.5,-0.5 14.5,-6 45,-10 C14.5,22.5 -16.5,23 -47,-6 Z',
    teeth: 'M-36,-2.5 C-12.5,-0.5 10.5,-3.5 34,-6.5 C10.5,3 -12.5,6 -36,-2.5 Z',
    cornerLeft: 'M-55,-12 Q-42.5,-1.5 -26.5,1',
    cornerRight: 'M56,-20 Q41,-6 24,-3.5',
    cornerOpacity: 1,
  },

  // E: abertura media, ancha, con dientes bien visibles.
  E: {
    lip: 'M-49,-5 C-17.5,1 14.5,-5 46,-9 C14.5,28 -17.5,27.5 -49,-5 Z',
    cavity: 'M-49,-5 C-17.5,1 14.5,-5 46,-9 C14.5,10 -17.5,10.5 -49,-5 Z',
    teeth: 'M-39,-2 C-14,1 11,-2.5 36,-6 C11,3.5 -14,7 -39,-2 Z',
    cornerLeft: 'M-57,-11 Q-44.5,-0.5 -28.5,2',
    cornerRight: 'M57,-19 Q42,-5 25,-2.5',
    cornerOpacity: 1,
  },

  // O: redondeada.
  O: {
    lip: 'M-22,-2 C-21,-15 20,-16 22,-3 C22,22 -22,23 -22,-2 Z',
    cavity: 'M-22,-2 C-21,-15 20,-16 22,-3 C20,12.5 -20,13.5 -22,-2 Z',
    teeth: 'M-11,-10 C-5.5,-12 5.5,-12 11,-10 C5.5,-12 -5.5,-12 -11,-10 Z',
    cornerLeft: 'M-26,-5 Q-20,0 -12.5,1.5',
    cornerRight: 'M27.5,-8 Q20,-1 12,0.5',
    cornerOpacity: 0,
  },

  // U, W: pequeña y redonda.
  U: {
    lip: 'M-15,-1 C-14,-11 14,-12 15,-2 C15,15 -15,16 -15,-1 Z',
    cavity: 'M-15,-1 C-14,-11 14,-12 15,-2 C13,8 -13,9 -15,-1 Z',
    teeth: 'M-7,-7 C-3,-8 3,-8 7,-7 C3,-8 -3,-8 -7,-7 Z',
    cornerLeft: 'M-19,-4 Q-13,0 -5,1.5',
    cornerRight: 'M20,-7 Q13,-0.5 5,0',
    cornerOpacity: 0,
  },

  // F, V: dientes superiores apoyados directamente sobre el labio inferior.
  FV: {
    lip: 'M-44,-4 C-15.5,0.5 13.5,-4 42,-7.5 C13.5,17 -15.5,16.5 -44,-4 Z',
    cavity: 'M-44,-4 C-15.5,0.5 13.5,-4 42,-7.5 C13.5,5.5 -15.5,6 -44,-4 Z',
    teeth: 'M-36,-1.5 C-12.5,0.5 10.5,-2.5 34,-5.5 C10.5,5 -12.5,8 -36,-1.5 Z',
    cornerLeft: 'M-51,-9.5 Q-40,0 -25.5,2.5',
    cornerRight: 'M52,-16.5 Q38.5,-4 23,-1.5',
    cornerOpacity: 1,
  },

  // L, T, D, N: ligeramente abierta, más estrecha que E.
  L: {
    lip: 'M-42,-4.5 C-14.5,1 12.5,-4 40,-8 C12.5,26 -14.5,25.5 -42,-4.5 Z',
    cavity: 'M-42,-4.5 C-14.5,1 12.5,-4 40,-8 C12.5,7 -14.5,7 -42,-4.5 Z',
    teeth: 'M-30,-1.5 C-10.5,0.5 8.5,-2 28,-5 C8.5,1.5 -10.5,4 -30,-1.5 Z',
    cornerLeft: 'M-49,-10 Q-38,-0.5 -23.5,2',
    cornerRight: 'M50,-17 Q36.5,-4.5 21,-2',
    cornerOpacity: 1,
  },
};

/**
 * Variantes de REST según la expresión. Cuando el avatar está en silencio
 * muestra la de la expresión activa (setExpression).
 */
export const expressionShapes = {
  neutral: mouthShapes.REST,

  happy: {
    lip: 'M-53,-6 C-18.5,2.5 15.5,-4.5 50,-11 C15.5,33 -18.5,32.5 -53,-6 Z',
    cavity: 'M-53,-6 C-18.5,2.5 15.5,-4.5 50,-11 C15.5,-4.5 -18.5,2.5 -53,-6 Z',
    teeth: 'M-39.5,-2.5 C-14,1 11,-3 36.5,-7.5 C11,-3 -14,1 -39.5,-2.5 Z',
    cornerLeft: 'M-61.5,-14 Q-48.5,-1.5 -31.5,1.5',
    cornerRight: 'M61.5,-23 Q46,-7 28,-4',
    cornerOpacity: 1,
  },

  serious: {
    lip: 'M-45,-3 C-16,2 13,-3 42,-6 C13,24 -16,23 -45,-3 Z',
    cavity: 'M-45,-3 C-16,2 13,-3 42,-6 C13,-3 -16,2 -45,-3 Z',
    teeth: 'M-33.5,-0.5 C-12,1.5 9,-1 30.5,-3.5 C9,-1 -12,1.5 -33.5,-0.5 Z',
    cornerLeft: 'M-52,-8 Q-41,1 -27.5,3',
    cornerRight: 'M51.5,-14.5 Q38.5,-2.5 24,-0.5',
    cornerOpacity: 0.85,
  },
};

/** Apertura aproximada (0–1) de cada visema; modula el micro-movimiento de la cabeza. */
export const visemeOpenness = {
  REST: 0, MBP: 0, AI: 1, E: 0.6, O: 0.85, U: 0.4, FV: 0.25, L: 0.45,
};
