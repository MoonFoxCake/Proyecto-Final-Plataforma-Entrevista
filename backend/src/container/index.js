// Firestore repositories
const FirestoreUserRepository = require('../repositories/firestore/FirestoreUserRepository');
const FirestoreOrganizationRepository = require('../repositories/firestore/FirestoreOrganizationRepository');
const FirestoreEventRepository = require('../repositories/firestore/FirestoreEventRepository');
const FirestoreCandidateRepository = require('../repositories/firestore/FirestoreCandidateRepository');
const FirestoreInvitationRepository = require('../repositories/firestore/FirestoreInvitationRepository');

// In-memory repositories (tests)
const InMemoryUserRepository = require('../repositories/in-memory/InMemoryUserRepository');
const InMemoryOrganizationRepository = require('../repositories/in-memory/InMemoryOrganizationRepository');
const InMemoryEventRepository = require('../repositories/in-memory/InMemoryEventRepository');
const InMemoryCandidateRepository = require('../repositories/in-memory/InMemoryCandidateRepository');
const InMemoryInvitationRepository = require('../repositories/in-memory/InMemoryInvitationRepository');

// Services
const AuthService = require('../services/AuthService');
const TenantService = require('../services/TenantService');
const EventService = require('../services/EventService');
const CandidateService = require('../services/CandidateService');
const InvitationService = require('../services/InvitationService');
const ReviewService = require('../services/ReviewService');
const ResendEmailService = require('../services/ResendEmailService');

/**
 * Builds the repository set for the given backing store.
 *
 * @param {'firestore'|'memory'} type
 * @returns {Record<string, object>}
 */
function buildRepositories(type) {
  if (type === 'memory') {
    return {
      userRepo: new InMemoryUserRepository(),
      organizationRepo: new InMemoryOrganizationRepository(),
      eventRepo: new InMemoryEventRepository(),
      candidateRepo: new InMemoryCandidateRepository(),
      invitationRepo: new InMemoryInvitationRepository(),
    };
  }

  return {
    userRepo: new FirestoreUserRepository(),
    organizationRepo: new FirestoreOrganizationRepository(),
    eventRepo: new FirestoreEventRepository(),
    candidateRepo: new FirestoreCandidateRepository(),
    invitationRepo: new FirestoreInvitationRepository(),
  };
}

/**
 * Dependency-injection container. Instantiates every repository for the
 * requested backing store, injects them into the services, and returns
 * the services ready to be used by controllers.
 *
 * @param {'firestore'|'memory'} [type='firestore']
 * @returns {{
 *   repos: Record<string, object>,
 *   authService: AuthService,
 *   tenantService: TenantService,
 *   eventService: EventService,
 *   candidateService: CandidateService,
 * }}
 */
function createContainer(type = 'firestore') {
  const repos = buildRepositories(type);
  const eventService = new EventService(repos.eventRepo);
  const candidateService = new CandidateService(repos.candidateRepo, eventService);
  const emailService = new ResendEmailService({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM,
  });
  const invitationService = new InvitationService({
    invitationRepo: repos.invitationRepo,
    candidateService,
    candidateRepo: repos.candidateRepo,
    eventService,
    organizationRepo: repos.organizationRepo,
    emailService,
    frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN,
  });
  const reviewService = new ReviewService({
    eventRepo: repos.eventRepo,
    candidateRepo: repos.candidateRepo,
    invitationRepo: repos.invitationRepo,
    organizationRepo: repos.organizationRepo,
  });

  return {
    repos,
    authService: new AuthService(repos.userRepo, repos.organizationRepo),
    tenantService: new TenantService(repos.organizationRepo),
    eventService,
    candidateService,
    invitationService,
    reviewService,
  };
}

module.exports = { createContainer };
