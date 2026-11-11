const { NotFoundError, ValidationError, ExternalServiceError } = require('../utils/errors');
const { hasResponse, isWithdrawn, phaseState } = require('../utils/phases');

const BUCKET = process.env.SUPABASE_RESULTS_BUCKET || 'evaluation-results';
const MODULES = ['A', 'B', 'C'];

const groupBy = (items, keyOf) => items.reduce((groups, item) => {
  const key = keyOf(item);
  (groups[key] ||= []).push(item);
  return groups;
}, {});

class ResultDeliveryService {
  constructor({ eventRepo, candidateRepo, organizationRepo, emailService, settingsService, frontendUrl }) {
    this.settingsService = settingsService;
    this.eventRepo = eventRepo;
    this.candidateRepo = candidateRepo;
    this.organizationRepo = organizationRepo;
    this.emailService = emailService;
    this.frontendUrl = frontendUrl;
  }

  /** A phase is ready when everyone still in it answered (older processes: once published). */
  isPhaseReady(event, module, candidates) {
    if (module === 'A' && (event.evaluationsPublishedAt || event.status === 'PUBLISHED')) return true;
    if (module === 'B' && !event.moduleB?.macrocase) return false;
    if (module === 'C' && !event.moduleC?.microcase) return false;
    return phaseState(module, candidates).complete;
  }

  async listPending() {
    const [events, candidates, organizations] = await Promise.all([
      this.eventRepo.findAll(),
      this.candidateRepo.findAll(),
      this.organizationRepo.findAll(),
    ]);
    const byEvent = groupBy(candidates, (candidate) => candidate.eventId);
    const companyOf = new Map(organizations.map((organization) => [organization.id, organization.companyName || organization.name]));
    const rows = [];
    for (const event of events) {
      const eventCandidates = byEvent[event.id] || [];
      const orgId = event.orgId || event.recruiterOrgId;
      for (const module of MODULES) {
        if (event.moduleResults?.[module]?.deliveredAt || !this.isPhaseReady(event, module, eventCandidates)) continue;
        const state = phaseState(module, eventCandidates);
        rows.push({
          eventId: event.id,
          eventName: event.name || event.title || 'Proceso',
          module,
          orgId,
          company: companyOf.get(orgId) || 'Empresa',
          completed: state.completed,
          withdrawn: state.withdrawn,
          createdAt: event.createdAt || null,
        });
      }
    }
    return rows;
  }

  /** Module A's PDF also publishes the phase: the company can then choose who continues. */
  async publishModuleA(event, candidates, adminUid, now) {
    if (event.evaluationsPublishedAt) return {};
    await Promise.all(candidates.filter((candidate) => !isWithdrawn(candidate, 'A') && hasResponse(candidate)).map((candidate) => this.candidateRepo.update(candidate.id, {
      reviewStatus: 'REVIEWED',
      reviewedAt: candidate.reviewedAt || now,
      reviewedBy: candidate.reviewedBy || adminUid,
      profilePublishedAt: now,
    })));
    return { status: 'PUBLISHED', evaluationsPublishedAt: now, evaluationsPublishedBy: adminUid };
  }

  async deliver(eventId, module, file, adminUid) {
    if (!MODULES.includes(module)) throw new ValidationError('Fase no válida.');
    if (!file || file.mimetype !== 'application/pdf' || !file.buffer?.length) throw new ValidationError('Debes adjuntar un archivo PDF válido.');
    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundError('Proceso no encontrado.');
    const candidates = await this.candidateRepo.findByEventId(eventId);
    if (!this.isPhaseReady(event, module, candidates)) throw new ValidationError(`La Fase ${module} todavía no está completada.`);
    const path = `${eventId}/fase-${module.toLowerCase()}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { supabase } = require('../config/supabase');
    const { error } = await supabase.storage.from(BUCKET).upload(path, file.buffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw new ExternalServiceError(`No se pudo subir el PDF: ${error.message}. Verifica que exista el bucket ${BUCKET}.`);
    const deliveredAt = new Date();
    const result = { module, path, fileName: file.originalname, deliveredAt, deliveredBy: adminUid, status: 'DELIVERED' };
    const published = module === 'A' ? await this.publishModuleA(event, candidates, adminUid, deliveredAt) : {};
    await this.eventRepo.update(eventId, { ...published, moduleResults: { ...(event.moduleResults || {}), [module]: result } });
    const org = await this.organizationRepo.findById(event.orgId || event.recruiterOrgId);
    const email = org?.email || org?.contactEmail || org?.correo;
    if (email && this.frontendUrl && this.emailService?.sendResultNotification) {
      const url = `${(this.frontendUrl || '').replace(/\/$/, '')}/company/events/${eventId}/resultados`;
      try {
        const settings = await this.settingsService?.get();
        await this.emailService.sendResultNotification({ email, company: org.companyName || org.name || 'Empresa', eventName: event.name || event.title || 'Proceso', module, url, templates: settings?.emails });
      } catch (notificationError) { result.notificationError = notificationError.message; }
    }
    return result;
  }

  async getDownloadUrl(eventId, module, orgId) {
    if (!MODULES.includes(module)) throw new ValidationError('Fase no válida.');
    const event = await this.eventRepo.findById(eventId);
    if (!event || (event.orgId || event.recruiterOrgId) !== orgId) throw new NotFoundError('Proceso no encontrado.');
    const result = event.moduleResults?.[module];
    if (!result?.path || result.status !== 'DELIVERED') throw new NotFoundError('El resultado todavía no está disponible.');
    const { supabase } = require('../config/supabase');
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(result.path, 60 * 60, { download: result.fileName });
    if (error || !data?.signedUrl) throw new ExternalServiceError(`No se pudo generar el enlace de descarga: ${error?.message || 'error desconocido'}.`);
    return { url: data.signedUrl, fileName: result.fileName };
  }
}
module.exports = ResultDeliveryService;
