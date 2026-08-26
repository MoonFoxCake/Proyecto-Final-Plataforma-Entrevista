/**
 * Options for the candidate registration form (academic level + area of
 * interest). Frontend-only for now — no backend enum exists yet to mirror
 * (unlike `constants.js`'s ROLES). Move these there once the backend
 * defines the canonical lists.
 */

export const ACADEMIC_LEVELS = [
  'Técnico / Tecnólogo',
  'Universitario en curso',
  'Universitario graduado',
  'Especialización',
  'Maestría',
  'Doctorado',
];

export const PROFESSIONAL_AREAS = [
  'Tecnología e Informática',
  'Ingeniería Civil y Construcción',
  'Administración y Negocios',
  'Marketing y Comunicación',
  'Finanzas y Contabilidad',
  'Recursos Humanos',
  'Diseño y Creatividad',
  'Salud y Bienestar',
  'Derecho y Ciencias Sociales',
  'Educación e Investigación',
  'Otro',
];
