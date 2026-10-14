const crypto = require('crypto');

/**
 * Temporary access codes for onsite evaluations: printed on a card, typed
 * by the candidate at the venue.
 *
 * - No ambiguous characters (0/O, 1/I/L), so they read and type easily.
 * - 10 characters from 31 symbols ≈ 8·10^14 combinations (~49 bits), drawn
 *   with `crypto.randomInt`; failed attempts are rate limited at login.
 * - Only an HMAC with a server-side secret (ACCESS_CODE_PEPPER) is stored:
 *   with this little entropy a plain hash could be brute-forced offline if
 *   the database leaked; without the secret it cannot.
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;
const GROUP_LENGTH = 5;
const WELL_FORMED = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

// Appointments are in Guatemala, which has no daylight saving time.
const APPOINTMENT_TIME_ZONE = 'America/Guatemala';
const APPOINTMENT_UTC_OFFSET = '-06:00';

/** "XXXXX-XXXXX" as printed on the card. */
function formatAccessCode(code) {
  const normalized = normalizeAccessCode(code);
  return `${normalized.slice(0, GROUP_LENGTH)}-${normalized.slice(GROUP_LENGTH)}`;
}

/** What the candidate typed, without spaces or dashes and in capitals. */
function normalizeAccessCode(input) {
  return String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
}

const isWellFormedAccessCode = (input) => WELL_FORMED.test(normalizeAccessCode(input));

function generateAccessCode(randomInt = crypto.randomInt) {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return formatAccessCode(code);
}

function hashAccessCode(code, pepper) {
  if (!pepper) throw new Error('ACCESS_CODE_PEPPER is required to hash access codes');
  return crypto.createHmac('sha256', pepper).update(normalizeAccessCode(code)).digest('hex');
}

/** "2026-11-05": the calendar day of an instant in the appointment's time zone. */
const appointmentDay = (instant) => new Intl.DateTimeFormat('en-CA', {
  timeZone: APPOINTMENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(instant));

/** Last instant of the appointment's day, in the appointment's time zone. */
function endOfAppointmentDay(startsAt) {
  return new Date(`${appointmentDay(startsAt)}T23:59:59.999${APPOINTMENT_UTC_OFFSET}`);
}

/** Whether `now` falls on the appointment's day (appointment time zone). */
const isAppointmentDay = (startsAt, now) => appointmentDay(startsAt) === appointmentDay(now);

// Minutes after the start of the appointment during which a code can be used
// to begin the evaluation, for appointments stored before the field existed.
const DEFAULT_ENTRY_WINDOW_MINUTES = 30;

/**
 * When the codes of an appointment work: from its start, for its entry
 * window. The window only limits beginning; a session already open
 * continues after it closes.
 *
 * @returns {{ opensAt: Date, closesAt: Date, minutes: number }}
 */
function entryWindow(appointment) {
  const minutes = appointment?.entryWindowMinutes ?? DEFAULT_ENTRY_WINDOW_MINUTES;
  const opensAt = new Date(appointment.startsAt);
  return { opensAt, closesAt: new Date(opensAt.getTime() + minutes * 60 * 1000), minutes };
}

/** 'PENDING' before the window, 'OPEN' during it, 'CLOSED' after it. */
function entryWindowState(appointment, now) {
  const { opensAt, closesAt } = entryWindow(appointment);
  if (now < opensAt) return 'PENDING';
  return now < closesAt ? 'OPEN' : 'CLOSED';
}

module.exports = {
  ALPHABET,
  CODE_LENGTH,
  formatAccessCode,
  normalizeAccessCode,
  isWellFormedAccessCode,
  generateAccessCode,
  hashAccessCode,
  endOfAppointmentDay,
  isAppointmentDay,
  DEFAULT_ENTRY_WINDOW_MINUTES,
  entryWindow,
  entryWindowState,
};
