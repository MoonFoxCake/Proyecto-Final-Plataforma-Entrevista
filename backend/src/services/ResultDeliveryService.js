const { NotFoundError, ValidationError, ExternalServiceError } = require('../utils/errors');
const BUCKET = process.env.SUPABASE_RESULTS_BUCKET || 'evaluation-results';

class ResultDeliveryService {
  constructor({ eventRepo, candidateRepo, organizationRepo, emailService, frontendUrl }) {
    this.eventRepo = eventRepo;
    this.candidateRepo = candidateRepo;
    this.organizationRepo = organizationRepo;
    this.emailService = emailService;
    this.frontendUrl = frontendUrl;
  }

  async listPending() {
    const events = await this.eventRepo.findAll();
    const rows = [];
    for (const event of events) {
      const candidates = await this.candidateRepo.findByEventId(event.id);
      const phases = [
        ['A', Boolean(event.evaluationsPublishedAt || event.status === 'PUBLISHED')],
        ['B', Boolean(event.moduleB?.macrocase && candidates.some((c) => c.moduleB) && candidates.filter((c) => c.moduleB).every((c) => c.moduleB.status === 'COMPLETED'))],
        ['C', Boolean(event.moduleC?.microcase && candidates.some((c) => c.moduleC?.assignedQuestions?.length) && candidates.filter((c) => c.moduleC?.assignedQuestions?.length).every((c) => c.moduleC.status === 'COMPLETED'))],
      ];
      phases.forEach(([module, completed]) => {
        if (completed && !event.moduleResults?.[module]?.deliveredAt) rows.push({ eventId: event.id, eventName: event.name || event.title || 'Proceso', module, orgId: event.orgId || event.recruiterOrgId });
      });
    }
    return rows;
  }

  async deliver(eventId, module, file, adminUid) {
    if (!['A', 'B', 'C'].includes(module)) throw new ValidationError('Fase no válida.');
    if (!file || file.mimetype !== 'application/pdf' || !file.buffer?.length) throw new ValidationError('Debes adjuntar un archivo PDF válido.');
    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundError('Proceso no encontrado.');
    const candidates = await this.candidateRepo.findByEventId(eventId);
    const phaseCandidates = module === 'B' ? candidates.filter((c) => c.moduleB) : module === 'C' ? candidates.filter((c) => c.moduleC?.assignedQuestions?.length) : [];
    const completed = module === 'A' ? Boolean(event.evaluationsPublishedAt || event.status === 'PUBLISHED') : phaseCandidates.length > 0 && phaseCandidates.every((c) => c[`module${module}`]?.status === 'COMPLETED');
    if (!completed) throw new ValidationError(`La Fase ${module} todavía no está completada.`);
    const path = `${eventId}/fase-${module.toLowerCase()}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { supabase } = require('../config/supabase');
    const { error } = await supabase.storage.from(BUCKET).upload(path, file.buffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw new ExternalServiceError(`No se pudo subir el PDF: ${error.message}. Verifica que exista el bucket ${BUCKET}.`);
    const deliveredAt = new Date();
    const result = { module, path, fileName: file.originalname, deliveredAt, deliveredBy: adminUid, status: 'DELIVERED' };
    await this.eventRepo.update(eventId, { moduleResults: { ...(event.moduleResults || {}), [module]: result } });
    const org = await this.organizationRepo.findById(event.orgId || event.recruiterOrgId);
    const email = org?.email || org?.contactEmail || org?.correo;
    if (email && this.frontendUrl && this.emailService?.sendResultNotification) {
      const url = `${(this.frontendUrl || '').replace(/\/$/, '')}/company/events/${eventId}/resultados`;
      try { await this.emailService.sendResultNotification({ email, company: org.companyName || org.name || 'Empresa', eventName: event.name || event.title || 'Proceso', module, url }); } catch (error) { result.notificationError = error.message; }
    }
    return result;
  }

  async getDownloadUrl(eventId, module, orgId) {
    if (!['A', 'B', 'C'].includes(module)) throw new ValidationError('Fase no válida.');
    const event = await this.eventRepo.findById(eventId);
    if (!event || (event.orgId || event.recruiterOrgId) !== orgId) throw new NotFoundError('Proceso no encontrado.');
    const result = event.moduleResults?.[module];
    if (!result?.path || result.status !== 'DELIVERED') throw new NotFoundError('El resultado todavía no está disponible.');
    const { supabase } = require('../config/supabase');
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(result.path, 60 * 60);
    if (error || !data?.signedUrl) throw new ExternalServiceError(`No se pudo generar el enlace de descarga: ${error?.message || 'error desconocido'}.`);
    return { url: data.signedUrl, fileName: result.fileName };
  }
}
module.exports = ResultDeliveryService;
