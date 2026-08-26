/**
 * Jest global setup.
 *
 * Runs once before each test file. Use it to configure global test
 * environment concerns (env vars, global mocks, custom matchers) that
 * every test suite should share.
 */

process.env.NODE_ENV = 'test';

// TODO: register global mocks (e.g. firebase-admin) here if/when needed.
