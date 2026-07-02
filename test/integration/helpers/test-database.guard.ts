/**
 * Database safety guard for integration tests.
 *
 * Validates that a URL pointed at a test database satisfies all safety
 * criteria before any migration or destructive action runs:
 *
 * 1. APP_NODE_ENV must be exactly 'test'
 * 2. Host must be localhost / 127.0.0.1 / IPv6 loopback (rejects 0.0.0.0)
 * 3. Database name must clearly identify as a test database: must be exactly
 *    `test`, start with `test_`, or end with `_test`. Rejects names such as
 *    `contest` or `latest` that merely *contain* "test".
 *
 * Uses the standard WHATWG URL parser (not custom string splitting) so the
 * validation is reliable across all valid URI forms. Never includes usernames,
 * passwords, or complete URLs in error messages — only host, port, and
 * database name are disclosed.
 *
 * Call this before running migrations or any reset action. It throws a
 * descriptive error describing exactly which criterion failed so the
 * developer can fix it immediately.
 */

/** Hostnames considered safe for integration testing. Rejects 0.0.0.0. */
const ALLOWED_TEST_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/**
 * Test whether a database name is an unambiguous test database name.
 * Must be exactly `test`, start with `test_`, or end with `_test`.
 * Rejects names like `contest` or `latest` that merely contain "test".
 */
function isTestDatabaseName(dbName: string): boolean {
  if (dbName.length === 0) return false;
  return (
    dbName === 'test' ||
    dbName.startsWith('test_') ||
    dbName.endsWith('_test') ||
    dbName === 'TEST' ||
    dbName.startsWith('TEST_') ||
    dbName.endsWith('_TEST')
  );
}

/**
 * Validate a database URL for use in integration tests.
 *
 * Uses the standard WHATWG URL constructor for parsing. Despite the common
 * concern about certain password characters, the URL constructor handles
 * percent-encoded credentials correctly; plain Postgres connection strings
 * with unusual-but-valid ASCII characters in passwords also parse correctly
 * as long as they don't contain raw `@` or `:` ambiguities (which Postgres
 * requires percent-encoding for anyway).
 *
 * Throws a descriptive error if any criterion is not met:
 * - APP_NODE_ENV must be exactly "test"
 * - URL must be a valid postgres:// or postgresql:// URL
 * - Host must be a local/loopback address (rejects 0.0.0.0)
 * - Database name must be an unambiguous test name (exactly `test`, `test_*`, or `*_test`)
 *
 * Error messages NEVER include usernames, passwords, or the complete URL.
 * Only host, port, and database name are disclosed.
 */
export function validateTestDatabaseUrl(url: string | undefined): void {
  if (!url) {
    throw new Error(
      'Integration test database validation FAILED: DB_PRIMARY_URL is not set.\n' +
        '  The integration test runner must set DB_PRIMARY_URL before running tests.',
    );
  }

  const nodeEnv = process.env.APP_NODE_ENV;
  if (nodeEnv !== 'test') {
    throw new Error(
      'Integration test database validation FAILED: APP_NODE_ENV must be "test", ' +
        `got "${String(nodeEnv)}".\n` +
        '  This guard prevents accidental destructive actions against non-test databases.\n' +
        '  Set APP_NODE_ENV=test in the environment before running integration tests.',
    );
  }

  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      'Integration test database validation FAILED: URL must start with postgres:// or postgresql://.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'Integration test database validation FAILED: URL could not be parsed.',
    );
  }

  const host = parsed.hostname;
  if (!ALLOWED_TEST_HOSTS.includes(host)) {
    throw new Error(
      'Integration test database validation FAILED: host is not a local/test-scoped host.\n' +
        `  Host: "${host}"\n` +
        '  Allowed hostnames: localhost, 127.0.0.1, ::1\n' +
        '  Refusing to connect to a remote or production database from integration tests.',
    );
  }

  // Use pathname to extract database name (removes leading '/')
  const dbName = parsed.pathname.replace(/^\//, '');

  if (!isTestDatabaseName(dbName)) {
    throw new Error(
      'Integration test database validation FAILED: database name does not clearly identify as a test database.\n' +
        `  Database: "${dbName}"\n` +
        '  Test database names must be exactly "test", start with "test_", or end with "_test".\n' +
        '  This prevents accidental data loss against non-test databases.',
    );
  }
}
