const { instrumentOf } = require('../utils/moduleA');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  hasResponse, isWithdrawn, phaseState, reportState,
} = require('../utils/phases');

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

/** `{ '2026-11': 3 }`: evaluations submitted per month, across every phase. */
function completionsByMonth(candidates) {
  const counts = {};
  candidates.flatMap((candidate) => [candidate.submittedAt, candidate.moduleB?.submittedAt, candidate.moduleC?.submittedAt]).forEach((value) => {
    if (!value) return;
    const date = new Date(value?.toDate?.() ?? value);
    if (Number.isNaN(date.getTime())) return;
    const month = date.toISOString().slice(0, 7);
    counts[month] = (counts[month] || 0) + 1;
  });
  return counts;
}

/** Module B answer: the chosen option (or Likert value in older processes) and the options offered. */
function macrocaseAnswer(answer, index) {
  const hasValue = Object.prototype.hasOwnProperty.call(answer, 'value');
  return {
    questionId: answer.questionId,
    number: index + 1,
    question: answer.question,
    text: answer.text,
    ...(hasValue ? { value: answer.value, label: answer.answerLabel || ANSWER_LABELS[answer.value] || null } : {}),
    ...(Array.isArray(answer.options) ? { options: answer.options } : {}),
    timedOut: Boolean(answer.timedOut),
  };
}

const stillIn = (candidates) => candidates.filter((candidate) => !isWithdrawn(candidate, 'A'));

function processStatus(event, candidates) {
  if (event.evaluationsPublishedAt || event.status === 'PUBLISHED') return 'PUBLISHED';
  const active = stillIn(candidates);
  if (active.length > 0 && active.every((candidate) => hasResponse(candidate) && candidate.reviewStatus === 'REVIEWED')) {
    return 'READY_TO_PUBLISH';
  }
  if (active.some(hasResponse)) return 'IN_REVIEW';
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

  /** Three reads for the whole list instead of two per process. */
  async listProcesses() {
    const [events, organizations, candidates] = await Promise.all([
      this.eventRepo.findAll(),
      this.organizationRepo.findAll(),
      this.candidateRepo.findAll(),
    ]);
    const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
    const candidatesByEvent = new Map();
    candidates.forEach((candidate) => {
      if (!candidatesByEvent.has(candidate.eventId)) candidatesByEvent.set(candidate.eventId, []);
      candidatesByEvent.get(candidate.eventId).push(candidate);
    });
    return events.map((event) => this.summarizeProcess(
      event,
      organizationById.get(event.orgId ?? event.recruiterOrgId),
      candidatesByEvent.get(event.id) || [],
    ));
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
    const moduleBSubmission = candidate.moduleB?.status === 'COMPLETED'
      ? await this.invitationRepo.findSubmissionByCandidate(candidate.id, eventId, 'B')
      : null;
    const moduleCSubmission = candidate.moduleC?.status === 'COMPLETED'
      ? await this.invitationRepo.findSubmissionByCandidate(candidate.id, eventId, 'C')
      : null;

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
        ...(answer.text ? { text: answer.text, dimension: answer.dimension || 'Sin dimensión', number: answer.number || 0 } : {}),
        value: answer.value,
        label: ANSWER_LABELS[answer.value] || 'Sin respuesta: el tiempo se agotó.',
      })),
      moduleB: this.moduleBDetail(event, candidate, moduleBSubmission),
      moduleC: this.moduleCDetail(event, candidate, moduleCSubmission),
    };
  }

  /** Third stage: null if the candidate was not sent Module C. */
  moduleCDetail(event, candidate, submission) {
    if (!candidate.moduleC) return null;
    return {
      status: candidate.moduleC.status,
      invitedAt: candidate.moduleC.invitedAt || null,
      submittedAt: submission?.submittedAt || candidate.moduleC.submittedAt || null,
      microcaseName: event.moduleC?.microcase?.name || 'Microcaso',
      story: event.moduleC?.microcase?.story || '',
      answers: (submission?.answers || []).map((answer, index) => ({
        questionId: answer.questionId,
        number: index + 1,
        skill: answer.sectionTitle || '',
        question: answer.question,
        value: answer.value,
        label: ANSWER_LABELS[answer.value] || null,
        timedOut: Boolean(answer.timedOut),
      })),
    };
  }

  /** Second stage: null if the candidate was not sent Module B. */
  moduleBDetail(event, candidate, submission) {
    if (!candidate.moduleB) return null;
    return {
      status: candidate.moduleB.status,
      invitedAt: candidate.moduleB.invitedAt || null,
      submittedAt: submission?.submittedAt || candidate.moduleB.submittedAt || null,
      macrocaseName: event.moduleB?.macrocase?.name || 'Macrocaso',
      instrumentVersion: submission?.instrumentVersion || null,
      answers: (submission?.answers || []).map(macrocaseAnswer),
      sections: this.answersBySection(submission?.answers || []),
    };
  }

  /**
   * Module B answers grouped by macrocase section, in the order they were
   * answered. Submissions made before sections existed have no `sectionId`
   * and come out as a single untitled section.
   */
  answersBySection(answers) {
    const sections = [];
    answers.forEach((answer, index) => {
      const sectionId = answer.sectionId || 'section-1';
      let section = sections.find((item) => item.sectionId === sectionId);
      if (!section) {
        section = { sectionId, number: sections.length + 1, title: answer.sectionTitle || '', answers: [] };
        sections.push(section);
      }
      section.answers.push(macrocaseAnswer(answer, index));
    });
    return sections;
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

  async buildProcess(event, includeParticipants = false) {
    const [organization, candidates] = await Promise.all([
      this.organizationRepo.findById(event.orgId ?? event.recruiterOrgId),
      this.candidateRepo.findByEventId(event.id),
    ]);
    const result = this.summarizeProcess(event, organization, candidates);
    if (includeParticipants) {
      result.participants = anonymousCandidates(candidates).map(({ candidate, anonymousId }) => ({
        anonymousId,
        submittedAt: candidate.submittedAt || null,
        status: isWithdrawn(candidate, 'A') ? 'WITHDRAWN' : !hasResponse(candidate) ? 'NO_RESPONSE' : candidate.reviewStatus === 'REVIEWED' ? 'REVIEWED' : 'PENDING_REVIEW',
        moduleBStatus: candidate.moduleB?.status || null,
        moduleCStatus: candidate.moduleC?.status || null,
      }));
    }
    return result;
  }

  summarizeProcess(event, organization, candidates) {
    const active = stillIn(candidates);
    const responsesReceived = active.filter(hasResponse).length;
    const reviewed = active.filter((candidate) => candidate.reviewStatus === 'REVIEWED').length;
    const safe = this.safeEvent(event);
    return {
      ...safe,
      // Result of each phase of the process: DELIVERED, PENDING, IN_PROGRESS or NOT_STARTED.
      reports: Object.fromEntries(safe.modules.map((module) => [module, reportState(event, module, candidates)])),
      company: organization?.companyName || organization?.name || 'Empresa sin nombre',
      status: processStatus(event, candidates),
      summary: {
        totalParticipants: active.length,
        responsesReceived,
        reviewed,
        pendingReview: Math.max(responsesReceived - reviewed, 0),
        phases: { A: phaseState('A', candidates), B: phaseState('B', candidates), C: phaseState('C', candidates) },
        completionsByMonth: completionsByMonth(candidates),
      },
    };
  }

  safeEvent(event) {
    return {
      id: event.id,
      modality: event.modality === 'onsite' ? 'onsite' : 'online',
      modules: Array.isArray(event.modules) && event.modules.length ? event.modules : ['A', 'B'],
      deliveredModules: Object.keys(event.moduleResults || {}).filter((module) => event.moduleResults[module]?.deliveredAt),
      results: Object.fromEntries(Object.entries(event.moduleResults || {})
        .filter(([, result]) => result?.deliveredAt)
        .map(([module, result]) => [module, { fileName: result.fileName || 'resultado.pdf', deliveredAt: result.deliveredAt }])),
      macrocaseName: event.moduleB?.macrocase?.name || null,
      microcaseName: event.moduleC?.microcase?.name || null,
      createdAt: event.createdAt || null,
      questionnaire: (({ groupId, name, version, instrumentVersion }) => ({ groupId, name, version, instrumentVersion }))(instrumentOf(event)),
      orgId: event.orgId ?? event.recruiterOrgId ?? null,
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
