const SVG_NS = 'http://www.w3.org/2000/svg';

export function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

let idCounter = 0;

/** Prefijo único para ids de <clipPath>/<filter>: permite varios avatares en la misma página. */
export function uniqueIdPrefix(base = 'ta') {
  idCounter += 1;
  return `${base}${idCounter}`;
}
