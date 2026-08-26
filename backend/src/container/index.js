// Firestore repositories
const FirestoreUserRepository = require('../repositories/firestore/FirestoreUserRepository');
const FirestoreOrganizationRepository = require('../repositories/firestore/FirestoreOrganizationRepository');

// In-memory repositories (tests)
const InMemoryUserRepository = require('../repositories/in-memory/InMemoryUserRepository');
const InMemoryOrganizationRepository = require('../repositories/in-memory/InMemoryOrganizationRepository');

// Services
const AuthService = require('../services/AuthService');
const TenantService = require('../services/TenantService');

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
    };
  }

  return {
    userRepo: new FirestoreUserRepository(),
    organizationRepo: new FirestoreOrganizationRepository(),
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
 * }}
 */
function createContainer(type = 'firestore') {
  const repos = buildRepositories(type);

  return {
    repos,
    authService: new AuthService(repos.userRepo),
    tenantService: new TenantService(repos.organizationRepo),
  };
}

module.exports = { createContainer };
