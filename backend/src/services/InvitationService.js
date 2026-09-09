const crypto = require('crypto');
const { CANDIDATE_STATUSES, INVITATION_STATUSES } = require('../utils/constants');
const { ValidationError } = require('../utils/errors');

const DAY_MS = 24 * 60 * 60 * 1000;

class InvitationService {
  constructor({ invitationRepo, candidateService, candidateRepo, eventService, organizationRepo, emailService, frontendUrl }) {
    this.invitationRepo = invitationRepo;
    this.candidateService = candidateService;
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
    this.organizationRepo = organizationRepo;
    this.emailService = emailService;
    this.frontendUrl = frontendUrl;
  }

  async publishForEvent(eventId, orgId) {
    if (!this.frontendUrl) {
      throw new ValidationError('FRONTEND_URL no está configurada en el backend.');
    }
    const event = await this.eventService.getEvent(eventId, orgId);
    const candidates = await this.candidateService.listByEvent(eventId, orgId);
    const pending = candidates.filter((item) => item.status === CANDIDATE_STATUSES.INVITED_PENDING);
    const organization = await this.organizationRepo.findById(orgId);
    const results = [];

    for (const candidate of pending) {
      results.push(await this.publishOne({ candidate, event, organization, orgId }));
    }

    return {
      total: pending.length,
      sent: results.filter((item) => item.sent).length,
      failed: results.filter((item) => !item.sent).length,
      failures: results.filter((item) => !item.sent).map(({ candidateId, message }) => ({ candidateId, message })),
    };
  }

  async validateAccess(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return { state: 'INVALID' };
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await this.invitationRepo.findByTokenHash(tokenHash);
    if (!invitation) return { state: 'INVALID' };
    if (invitation.status === INVITATION_STATUSES.COMPLETED) {
      return { state: 'COMPLETED', submittedAt: invitation.submittedAt };
    }
    if (invitation.status === INVITATION_STATUSES.CANCELLED) return { state: 'CANCELLED' };
    if (invitation.status === INVITATION_STATUSES.EXPIRED) return { state: 'EXPIRED' };

    const expiresAt = new Date(invitation.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await this.invitationRepo.update(invitation.id, {
        status: INVITATION_STATUSES.EXPIRED,
        expiredAt: new Date(),
      });
      return { state: 'EXPIRED' };
    }

    const candidate = await this.candidateRepo.findById(invitation.candidateId);
    let event;
    try {
      event = await this.eventService.getEvent(invitation.eventId, invitation.orgId);
    } catch {
      return { state: 'INVALID' };
    }
    if (!candidate || candidate.eventId !== event.id || candidate.orgId !== invitation.orgId) {
      return { state: 'INVALID' };
    }

    const availableFrom = new Date(candidate.fechaHoraCita || event.availableFrom);
    if (Number.isNaN(availableFrom.getTime())) return { state: 'INVALID' };
    const organization = await this.organizationRepo.findById(invitation.orgId);
    const context = {
      candidate: { nombreCompleto: candidate.nombreCompleto },
      event: {
        nombre: event.name || event.title || event.eventName || 'Proceso de evaluación',
        puesto: event.position || event.positionName || '',
        availableFrom,
      },
      organization: {
        nombre: organization?.companyName || organization?.name || 'La empresa',
      },
      expiresAt,
    };

    if (availableFrom > new Date()) {
      return { state: 'NOT_YET_AVAILABLE', ...context };
    }
    return { state: 'VALID', ...context };
  }

  async submitEvaluation(token, answers) {
    const access = await this.validateAccess(token);
    if (access.state !== 'VALID') return access;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await this.invitationRepo.findByTokenHash(tokenHash);
    const result = await this.invitationRepo.completeWithSubmission(tokenHash, answers);
    if (result.state === 'COMPLETED' && !result.alreadySubmitted && invitation) {
      await this.candidateRepo.update(invitation.candidateId, {
        status: CANDIDATE_STATUSES.EVALUATION_COMPLETED,
        submittedAt: result.submittedAt,
      });
    }
    return result;
  }

  async publishOne({ candidate, event, organization, orgId }) {
    let invitation;
    try {
      const previous = await this.invitationRepo.findActiveByCandidate(candidate.id, event.id);
      if (previous) {
        await this.invitationRepo.update(previous.id, {
          status: INVITATION_STATUSES.CANCELLED,
          cancelledAt: new Date(),
        });
      }

      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const availableAt = new Date(candidate.fechaHoraCita || event.availableFrom).getTime();
      const expiresAt = new Date(Math.max(Date.now(), availableAt) + DAY_MS);
      invitation = await this.invitationRepo.create({
        candidateId: candidate.id,
        eventId: event.id,
        orgId,
        tokenHash,
        status: INVITATION_STATUSES.ACTIVE,
        expiresAt,
      });

      const accessUrl = new URL('/evaluation/access', this.frontendUrl);
      accessUrl.searchParams.set('token', token);
      const delivery = await this.emailService.sendInvitation({
        candidate,
        event,
        organization,
        accessUrl: accessUrl.toString(),
      });
      await this.candidateRepo.update(candidate.id, {
        status: CANDIDATE_STATUSES.INVITATION_SENT,
        invitationId: invitation.id,
        invitedAt: new Date(),
        emailProviderId: delivery.id,
      });
      return { candidateId: candidate.id, sent: true };
    } catch (error) {
      if (invitation) {
        await this.invitationRepo.update(invitation.id, {
          status: INVITATION_STATUSES.CANCELLED,
          cancelledAt: new Date(),
        }).catch(() => {});
      }
      return { candidateId: candidate.id, sent: false, message: error.message };
    }
  }
}

module.exports = InvitationService;
