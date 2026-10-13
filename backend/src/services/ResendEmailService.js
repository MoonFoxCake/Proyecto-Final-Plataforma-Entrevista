const { ExternalServiceError } = require('../utils/errors');

const esc = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll(/\x22/g, '&quot;').replaceAll(/\x27/g, '&#039;');

const TIME_ZONE = 'America/Guatemala';
const formatDateTime = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'full', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value));
const formatDate = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'full', timeZone: TIME_ZONE }).format(new Date(value));
const formatTime = (value) => new Intl.DateTimeFormat('es-GT', { timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value));

const companyName = (organization) => organization?.companyName || organization?.name || 'La empresa';
const eventNameOf = (event) => event.name || event.title || 'Proceso de evaluación';

/** Shared e-mail frame: header, a coloured label and the body. */
function layout(label, body) {
  return `<div style='background:#f5f8fb;padding:32px 16px;font-family:Arial;color:#102033'><div style='max-width:600px;margin:auto;background:white;border-radius:16px;overflow:hidden'><div style='background:#102b46;padding:22px 28px;color:white;font-size:20px;font-weight:bold'>NexoPerfil</div><div style='padding:30px 28px'><p style='color:#0b918d;font-weight:bold'>${label}</p>${body}</div></div></div>`;
}

class ResendEmailService {
  constructor({ apiKey, from = 'NexoPerfil <onboarding@resend.dev>' } = {}) {
    this.apiKey = apiKey;
    this.from = from;
  }

  /**
   * Module A: invitation to the evaluation at the appointment time.
   * Module B: second stage (macrocase), open right away until `expiresAt`.
   */
  async sendInvitation({ candidate, event, organization, accessUrl, module = 'A', expiresAt }) {
    const company = companyName(organization);
    const eventName = eventNameOf(event);
    const isModuleB = module === 'B';
    const label = isModuleB ? 'SEGUNDA ETAPA' : 'EVALUACIÓN DISPONIBLE';
    const intro = isModuleB
      ? `${esc(company)} te invita a continuar con la segunda etapa de:`
      : `${esc(company)} te ha invitado a participar en:`;
    const dateLine = isModuleB
      ? `Disponible hasta: ${esc(formatDateTime(expiresAt))}`
      : `Fecha y hora: ${esc(formatDateTime(candidate.fechaHoraCita || event.availableFrom))}`;
    const stageNote = isModuleB
      ? "<p>En esta etapa leerás un caso y responderás por escrito las preguntas que te hará un asistente virtual. Activa el sonido de tu dispositivo.</p>"
      : '';
    const html = layout(label, `<h1>Hola, ${esc(candidate.nombreCompleto)}.</h1><p>${intro}</p><div style='background:#f4f8fb;border-radius:12px;padding:18px;margin:18px 0'><strong>${esc(eventName)}</strong><p>${dateLine}</p></div>${stageNote}<a href='${esc(accessUrl)}' style='display:inline-block;background:#0aada8;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold'>Acceder a la evaluación</a><p style='margin-top:24px;color:#718096;font-size:13px'>Este enlace es personal y temporal.</p>`);

    return this.send({
      to: candidate.correo,
      subject: isModuleB ? `Segunda etapa · ${eventName}` : `Invitación a evaluación · ${eventName}`,
      html,
    });
  }

  /**
   * Onsite citation: where and when to show up. On purpose it carries no
   * link, password or access code — access is handed out at the venue.
   *
   * @param {{ candidate: object, event: object, organization?: object, module?: 'A'|'B',
   *   appointment: { venue: string, room: string, startsAt: Date, endsAt: Date, instructions?: string } }} params
   */
  async sendCitation({ candidate, event, organization, module = 'A', appointment }) {
    const company = companyName(organization);
    const eventName = eventNameOf(event);
    const isModuleB = module === 'B';
    const row = (label, value) => `<tr><td style='padding:6px 12px 6px 0;color:#64748b;vertical-align:top;white-space:nowrap'>${label}</td><td style='padding:6px 0;font-weight:bold'>${esc(value)}</td></tr>`;
    const details = [
      row('Evento', eventName),
      event.position ? row('Puesto', event.position) : '',
      row('Fecha', formatDate(appointment.startsAt)),
      row('Horario', `${formatTime(appointment.startsAt)} a ${formatTime(appointment.endsAt)} (hora de Guatemala)`),
      row('Sede', appointment.venue),
      row('Ubicación', appointment.room),
    ].join('');
    const instructions = appointment.instructions
      ? `<p style='margin-top:18px'><strong>Indicaciones</strong></p><p style='white-space:pre-line'>${esc(appointment.instructions)}</p>`
      : '';
    const intro = isModuleB
      ? `${esc(company)} te cita a la segunda etapa presencial del proceso:`
      : `${esc(company)} te cita a una evaluación presencial:`;
    const html = layout(isModuleB ? 'CITACIÓN · SEGUNDA ETAPA' : 'CITACIÓN PRESENCIAL', `<h1>Hola, ${esc(candidate.nombreCompleto)}.</h1><p>${intro}</p><div style='background:#f4f8fb;border-radius:12px;padding:18px;margin:18px 0'><table style='border-collapse:collapse;font-size:14px'>${details}</table></div>${instructions}<p style='margin-top:18px'>Llega con anticipación y lleva un documento de identidad: se verificará tu identidad antes de comenzar. Tus datos de acceso a la evaluación se te entregarán en la sede.</p><p style='margin-top:24px;color:#718096;font-size:13px'>Este correo es solo una citación: no contiene enlaces, contraseñas ni códigos de acceso.</p>`);

    return this.send({
      to: candidate.correo,
      subject: isModuleB ? `Citación presencial · Segunda etapa · ${eventName}` : `Citación presencial · ${eventName}`,
      html,
    });
  }

  /**
   * Latest delivery event Resend has for a sent e-mail (`sent`, `delivered`,
   * `delivery_delayed`, `bounced`, `complained`, …).
   *
   * @returns {Promise<{ lastEvent: string | null }>}
   */
  async getEmailStatus(emailId) {
    this.requireApiKey();
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      const reason = result.message || result.error?.message || `HTTP ${response.status}`;
      throw new ExternalServiceError(`Resend no devolvió el estado del correo (${reason}).`);
    }
    return { lastEvent: result.last_event || null };
  }

  async send({ to, subject, html }) {
    this.requireApiKey();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, html }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      console.error('Resend rejected the email:', result);
      const reason = result.message || result.error?.message || `HTTP ${response.status}`;
      throw new ExternalServiceError(`Resend rechazó el envío (${reason}). Revisa RESEND_API_KEY, el remitente y el destinatario.`);
    }
    return { id: result.id };
  }

  requireApiKey() {
    if (!this.apiKey) {
      throw new ExternalServiceError('RESEND_API_KEY no está configurada en el backend.');
    }
  }
}

module.exports = ResendEmailService;
