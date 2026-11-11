const { ExternalServiceError } = require('../utils/errors');
const { entryWindow } = require('../utils/accessCode');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');

/** "{empresa} te invita" with the variables filled in; unknown names stay as they are. */
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);

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
   * A virtual evaluation link, usable from `availableAt` to `expiresAt` (the
   * opening and closing the company chose for that phase).
   */
  async sendInvitation({ candidate, event, organization, accessUrl, module = 'A', availableAt, expiresAt, templates = DEFAULT_SETTINGS.emails }) {
    const company = companyName(organization);
    const eventName = eventNameOf(event);
    const isModuleB = module === 'B';
    const isModuleC = module === 'C';
    const values = { empresa: company, evento: eventName };
    const label = isModuleC ? 'TERCERA ETAPA' : isModuleB ? 'SEGUNDA ETAPA' : 'EVALUACIÓN DISPONIBLE';
    const intro = esc(fill(isModuleC ? templates.moduleCIntro : isModuleB ? templates.moduleBIntro : templates.invitationIntro, values));
    const opensAt = availableAt || (isModuleB || isModuleC ? null : candidate.fechaHoraCita || event.availableFrom);
    const dateLine = [
      opensAt ? `Disponible desde: ${esc(formatDateTime(opensAt))}` : '',
      expiresAt ? `Disponible hasta: ${esc(formatDateTime(expiresAt))}` : '',
    ].filter(Boolean).join('<br>');
    const note = isModuleC ? templates.moduleCNote : isModuleB ? templates.moduleBNote : '';
    const stageNote = note ? `<p>${esc(fill(note, values))}</p>` : '';
    const html = layout(label, `<h1>Hola, ${esc(candidate.nombreCompleto)}.</h1><p>${intro}</p><div style='background:#f4f8fb;border-radius:12px;padding:18px;margin:18px 0'><strong>${esc(eventName)}</strong><p>${dateLine}</p></div>${stageNote}<a href='${esc(accessUrl)}' style='display:inline-block;background:#0aada8;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold'>Acceder a la evaluación</a><p style='margin-top:24px;color:#718096;font-size:13px'>Este enlace es personal y temporal.</p>`);

    return this.send({
      to: candidate.correo,
      subject: fill(isModuleC ? templates.moduleCSubject : isModuleB ? templates.moduleBSubject : templates.invitationSubject, values),
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
  async sendCitation({ candidate, event, organization, module = 'A', appointment, templates = DEFAULT_SETTINGS.emails }) {
    const company = companyName(organization);
    const eventName = eventNameOf(event);
    const isModuleB = module === 'B';
    const isModuleC = module === 'C';
    const row = (label, value) => `<tr><td style='padding:6px 12px 6px 0;color:#64748b;vertical-align:top;white-space:nowrap'>${label}</td><td style='padding:6px 0;font-weight:bold'>${esc(value)}</td></tr>`;
    const details = [
      row('Evento', eventName),
      event.position ? row('Puesto', event.position) : '',
      row('Fecha', formatDate(appointment.startsAt)),
      row('Horario', `${formatTime(appointment.startsAt)} a ${formatTime(appointment.endsAt)}`),
      row('Inicio de la evaluación', `de ${formatTime(appointment.startsAt)} a ${formatTime(entryWindow(appointment).closesAt)}`),
      row('Sede', appointment.venue),
      row('Ubicación', appointment.room),
    ].join('');
    const instructions = appointment.instructions
      ? `<p style='margin-top:18px'><strong>Indicaciones</strong></p><p style='white-space:pre-line'>${esc(appointment.instructions)}</p>`
      : '';
    const intro = isModuleB || isModuleC
      ? `${esc(company)} te cita a la ${isModuleC ? 'tercera' : 'segunda'} etapa presencial del proceso:`
      : `${esc(company)} te cita a una evaluación presencial:`;
    const html = layout(isModuleC ? 'CITACIÓN · TERCERA ETAPA' : isModuleB ? 'CITACIÓN · SEGUNDA ETAPA' : 'CITACIÓN PRESENCIAL', `<h1>Hola, ${esc(candidate.nombreCompleto)}.</h1><p>${intro}</p><div style='background:#f4f8fb;border-radius:12px;padding:18px;margin:18px 0'><table style='border-collapse:collapse;font-size:14px'>${details}</table></div>${instructions}<p style='margin-top:18px'>${esc(fill(templates.citationClosing, { empresa: company, evento: eventName }))}</p><p style='margin-top:24px;color:#718096;font-size:13px'>Este correo es solo una citación: no contiene enlaces, contraseñas ni códigos de acceso.</p>`);

    return this.send({
      to: candidate.correo,
      subject: isModuleC ? `Citación presencial · Tercera etapa · ${eventName}` : isModuleB ? `Citación presencial · Segunda etapa · ${eventName}` : `Citación presencial · ${eventName}`,
      html,
    });
  }

  /**
   * Latest delivery event Resend has for a sent e-mail (`sent`, `delivered`,
   * `delivery_delayed`, `bounced`, `complained`, …).
   *
   * @returns {Promise<{ lastEvent: string | null }>}
   */
  async sendResultNotification({ email, company, eventName, module, url, templates = DEFAULT_SETTINGS.emails }) {
    const values = { empresa: company, evento: eventName, fase: module };
    const html = layout('RESULTADOS DISPONIBLES', `<h1>Hola, ${esc(company)}.</h1><p>${esc(fill(templates.resultBody, values))}</p><p><a href='${esc(url)}' style='display:inline-block;background:#0aada8;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold'>Ver resultado</a></p>`);
    return this.send({ to: email, subject: fill(templates.resultSubject, values), html });
  }

  /** Tells the administrators that a phase finished and is waiting for its PDF. */
  async sendPhaseReady({ email, company, eventName, module, url }) {
    const html = layout('FASE LISTA PARA ENTREGA', `<h1>Fase ${esc(module)} completada</h1><p>El proceso <strong>${esc(eventName)}</strong> de ${esc(company)} ya terminó la Fase ${esc(module)} y está esperando su PDF de resultados.</p><p><a href='${esc(url)}' style='display:inline-block;background:#0aada8;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold'>Ir a Resultados</a></p>`);
    return this.send({ to: email, subject: `Fase ${module} lista para entrega · ${eventName}`, html });
  }

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
