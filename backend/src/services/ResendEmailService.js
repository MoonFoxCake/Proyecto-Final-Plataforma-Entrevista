const { ExternalServiceError } = require('../utils/errors');

const esc = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll(/\x22/g, '&quot;').replaceAll(/\x27/g, '&#039;');

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
    if (!this.apiKey) {
      throw new ExternalServiceError('RESEND_API_KEY no está configurada en el backend.');
    }
    const company = organization?.companyName || organization?.name || 'La empresa';
    const eventName = event.name || event.title || 'Proceso de evaluación';
    const formatDate = (value) => new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Guatemala',
    }).format(new Date(value));
    const isModuleB = module === 'B';
    const label = isModuleB ? 'SEGUNDA ETAPA' : 'EVALUACIÓN DISPONIBLE';
    const intro = isModuleB
      ? `${esc(company)} te invita a continuar con la segunda etapa de:`
      : `${esc(company)} te ha invitado a participar en:`;
    const dateLine = isModuleB
      ? `Disponible hasta: ${esc(formatDate(expiresAt))}`
      : `Fecha y hora: ${esc(formatDate(candidate.fechaHoraCita || event.availableFrom))}`;
    const stageNote = isModuleB
      ? "<p>En esta etapa leerás un caso y responderás por escrito las preguntas que te hará un asistente virtual. Activa el sonido de tu dispositivo.</p>"
      : '';
    const html = `<div style='background:#f5f8fb;padding:32px 16px;font-family:Arial;color:#102033'><div style='max-width:600px;margin:auto;background:white;border-radius:16px;overflow:hidden'><div style='background:#102b46;padding:22px 28px;color:white;font-size:20px;font-weight:bold'>NexoPerfil</div><div style='padding:30px 28px'><p style='color:#0b918d;font-weight:bold'>${label}</p><h1>Hola, ${esc(candidate.nombreCompleto)}.</h1><p>${intro}</p><div style='background:#f4f8fb;border-radius:12px;padding:18px;margin:18px 0'><strong>${esc(eventName)}</strong><p>${dateLine}</p></div>${stageNote}<a href='${esc(accessUrl)}' style='display:inline-block;background:#0aada8;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold'>Acceder a la evaluación</a><p style='margin-top:24px;color:#718096;font-size:13px'>Este enlace es personal y temporal.</p></div></div></div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [candidate.correo],
        subject: isModuleB ? `Segunda etapa · ${eventName}` : `Invitación a evaluación · ${eventName}`,
        html,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      console.error('Resend rejected invitation email:', result);
      const reason = result.message || result.error?.message || `HTTP ${response.status}`;
      throw new ExternalServiceError(`Resend rechazó el envío (${reason}). Revisa RESEND_API_KEY, el remitente y el destinatario.`);
    }
    return { id: result.id };
  }
}

module.exports = ResendEmailService;
