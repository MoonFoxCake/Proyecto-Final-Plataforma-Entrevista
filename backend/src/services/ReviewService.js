const { NotFoundError, ValidationError } = require('../utils/errors');

const QUESTIONS = Object.freeze({
  'demo-a-1': { number: 1, dimension: 'HBE', text: 'Cuando trabajo con otras personas, comunico mis ideas de forma clara y respetuosa.' },
  'demo-a-2': { number: 2, dimension: 'VPE', text: 'Ante un cambio inesperado, busco alternativas antes de detener mi trabajo.' },
  'demo-a-3': { number: 3, dimension: 'IM', text: 'Cuando cometo un error, lo reconozco y tomo acciones para corregirlo.' },
  'demo-a-4': { number: 4, dimension: 'InM', text: 'Organizo mis tareas para cumplir los compromisos en el tiempo acordado.' },
});

const ANSWER_LABELS = Object.freeze({
  1: 'Totalmente en desacuerdo',
  2: 'En desacuerdo',
  3: 'Neutral',
  4: 'De acuerdo',
  5: 'Totalmente de acuerdo',
});

function hasResponse(candidate) {
  return Boolean(candidate.submittedAt || candidate.status === 'EVALUATION_COMPLETED');
}

function processStatus(event, candidates) {
  if (event.evaluationsPublishedAt || event.status === 'PUBLISHED') return 'PUBLISHED';
  if (candidates.length > 0 && candidates.every((candidate) => hasResponse(candidate) && candidate.reviewStatus === 'REVIEWED')) {
    return 'READY_TO_PUBLISH';
  }
  if (candidates.some(hasResponse)) return 'IN_REVIEW';
  return event.status === 'FINALIZED' ? 'FINALIZED' : 'ACTIVE';
}

function anonymousCandidates(candidates) {
  return candidates.map((candidate, index) => ({
    candidate,
    anonymousId: candidate.anonymousCode || `P-${String(index + 1).padStart(3, '0')}`,
  }));
}

class ReviewService {
  constructor({ eventRepo, candidateRepo, invitationRepo, organizationRepo }) {
    this.eventRepo = eventRepo;
    this.candidateRepo = candidateRepo;
    this.invitationRepo = invitationRepo;
    this.organizationRepo = organizationRepo;
  }

  async listProcesses() {
    const events = await this.eventRepo.findAll();
    return Promise.all(events.map((event) => this.buildProcess(event)));
  }

  async getProcess(eventId) {
    const event = await this.requireEvent(eventId);
    return this.buildProcess(event, true);
  }

  async getParticipant(eventId, anonymousId) {
    const event = await this.requireEvent(eventId);
    const { candidate, resolvedId } = await this.resolveParticipant(eventId, anonymousId);
    const submission = await this.invitationRepo.findSubmissionByCandidate(candidate.id, eventId);
    if (!submission) throw new NotFoundError('Este participante aún no ha enviado respuestas.');

    return {
      process: this.safeEvent(event),
      anonymousId: resolvedId,
      module: submission.module || 'A',
      instrumentVersion: submission.instrumentVersion || 'DEMO_A_V1',
      submittedAt: submission.submittedAt || candidate.submittedAt,
      status: candidate.reviewStatus === 'REVIEWED' ? 'REVIEWED' : 'PENDING_REVIEW',
      observations: candidate.reviewObservations || '',
      reviewedAt: candidate.reviewedAt || null,
      answers: (submission.answers || []).map((answer) => ({
        questionId: answer.questionId,
        ...(QUESTIONS[answer.questionId] || { number: 0, dimension: 'Sin dimensión', text: 'Pregunta del instrumento' }),
        value: answer.value,
        label: ANSWER_LABELS[answer.value] || String(answer.value),
      })),
    };
  }

  async saveReview(eventId, anonymousId, data, adminUid) {
    await this.requireEvent(eventId);
    const { candidate } = await this.resolveParticipant(eventId, anonymousId);
    if (!hasResponse(candidate)) throw new ValidationError('No se puede revisar un participante sin respuestas.');
    const now = new Date();
    await this.candidateRepo.update(candidate.id, {
      reviewStatus: data.reviewed ? 'REVIEWED' : (candidate.reviewStatus || 'PENDING_REVIEW'),
      reviewObservations: data.observations?.trim() || '',
      reviewedAt: data.reviewed ? now : candidate.reviewedAt,
      reviewedBy: data.reviewed ? adminUid : candidate.reviewedBy,
    });
    return this.getParticipant(eventId, anonymousId);
  }

  async publish(eventId, adminUid) {
    const event = await this.requireEvent(eventId);
    const candidates = await this.candidateRepo.findByEventId(eventId);
    if (!candidates.length || !candidates.every((candidate) => hasResponse(candidate) && candidate.reviewStatus === 'REVIEWED')) {
      throw new ValidationError('Debes revisar a todos los participantes antes de publicar.');
    }
    if (event.evaluationsPublishedAt) return this.getProcess(eventId);
    const publishedAt = new Date();
    await Promise.all(candidates.map((candidate) => this.candidateRepo.update(candidate.id, { profilePublishedAt: publishedAt })));
    await this.eventRepo.update(eventId, {
      status: 'PUBLISHED',
      evaluationsPublishedAt: publishedAt,
      evaluationsPublishedBy: adminUid,
    });
    return this.getProcess(eventId);
  }

  async buildProcess(event, includeParticipants = false) {
    const [organization, candidates] = await Promise.all([
      this.organizationRepo.findById(event.orgId ?? event.recruiterOrgId),
      this.candidateRepo.findByEventId(event.id),
    ]);
    const responsesReceived = candidates.filter(hasResponse).length;
    const reviewed = candidates.filter((candidate) => candidate.reviewStatus === 'REVIEWED').length;
    const result = {
      ...this.safeEvent(event),
      company: organization?.companyName || organization?.name || 'Empresa sin nombre',
      status: processStatus(event, candidates),
      summary: {
        totalParticipants: candidates.length,
        responsesReceived,
        reviewed,
        pendingReview: Math.max(responsesReceived - reviewed, 0),
      },
    };
    if (includeParticipants) {
      result.participants = anonymousCandidates(candidates).map(({ candidate, anonymousId }) => ({
        anonymousId,
        submittedAt: candidate.submittedAt || null,
        status: !hasResponse(candidate) ? 'NO_RESPONSE' : candidate.reviewStatus === 'REVIEWED' ? 'REVIEWED' : 'PENDING_REVIEW',
      }));
    }
    return result;
  }

  safeEvent(event) {
    return {
      id: event.id,
      name: event.name || event.title || event.eventName || 'Proceso de evaluación',
      position: event.position || event.positionName || '',
      availableFrom: event.availableFrom || event.eventDate || event.date || null,
      endDate: event.endDate || event.availableUntil || null,
      evaluationsPublishedAt: event.evaluationsPublishedAt || null,
    };
  }

  async requireEvent(eventId) {
    const event = await this.eventRepo.findById(eventId);
    if (!event) throw new NotFoundError('Proceso no encontrado.');
    return event;
  }

  async resolveParticipant(eventId, anonymousId) {
    const candidates = await this.candidateRepo.findByEventId(eventId);
    const match = anonymousCandidates(candidates).find((item) => item.anonymousId === anonymousId);
    if (!match) throw new NotFoundError('Participante no encontrado.');
    return { candidate: match.candidate, resolvedId: match.anonymousId };
  }
}

module.exports = ReviewService;
