const { MODALITIES, MODULES } = require('./constants');
const { DEFAULT_ENTRY_WINDOW_MINUTES } = require('./accessCode');

/**
 * Reading an event's modality and modules. Events created before these
 * fields existed are online and may use both modules, as they always could.
 */

const modalityOf = (event) => (event?.modality === MODALITIES.ONSITE ? MODALITIES.ONSITE : MODALITIES.ONLINE);

const isOnsite = (event) => modalityOf(event) === MODALITIES.ONSITE;

/** Module A always applies; Module B only if the event includes it. */
function modulesOf(event) {
  return Array.isArray(event?.modules) && event.modules.length ? event.modules : [MODULES.A, MODULES.B];
}

/** Appointment as stored, from the validated request fields (see `citationSchema`). */
function toAppointment(citation) {
  return {
    venue: citation.sede.trim(),
    room: citation.ubicacion.trim(),
    startsAt: new Date(citation.fechaHoraInicio),
    endsAt: new Date(citation.fechaHoraFin),
    entryWindowMinutes: citation.ventanaInicioMinutos ?? DEFAULT_ENTRY_WINDOW_MINUTES,
    instructions: citation.indicaciones?.trim() || '',
  };
}

module.exports = { modalityOf, isOnsite, modulesOf, toAppointment };
