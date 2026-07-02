import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { validateTestDatabaseUrl } from './test-database.guard';

/**
 * Unit tests for the integration test database safety guard.
 *
 * These tests are FAST (no database connection) and exercise accepted
 * and rejected URL patterns to ensure the guard never allows a production
 * or development database to be used in integration tests.
 */

const VALID_TEST_URL = 'postgres://parks:parks_test@localhost:5433/parks_test';

describe('validateTestDatabaseUrl', () => {
  const originalEnv = process.env.APP_NODE_ENV;

  beforeEach(() => {
    process.env.APP_NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.APP_NODE_ENV = originalEnv;
  });

  // --- Accepted URLs ---

  it('accepts a valid parks_test URL on localhost', () => {
    expect(() => validateTestDatabaseUrl(VALID_TEST_URL)).not.toThrow();
  });

  it('accepts a valid test URL with 127.0.0.1', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@127.0.0.1:5432/myapp_test'),
    ).not.toThrow();
  });

  it('accepts a postgresql:// scheme test URL', () => {
    expect(() =>
      validateTestDatabaseUrl('postgresql://user:pass@localhost:5432/test_db'),
    ).not.toThrow();
  });

  it('accepts IPv6 localhost with test database', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@[::1]:5432/parks_test'),
    ).not.toThrow();
  });

  it('accepts a database named exactly "test"', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432/test'),
    ).not.toThrow();
  });

  it('accepts a database starting with "test_"', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432/test_myapp'),
    ).not.toThrow();
  });

  // --- Rejected URLs ---

  it('rejects a URL when APP_NODE_ENV is not test', () => {
    process.env.APP_NODE_ENV = 'development';
    expect(() => validateTestDatabaseUrl(VALID_TEST_URL)).toThrow(/APP_NODE_ENV/);
  });

  it('rejects undefined URL', () => {
    expect(() => validateTestDatabaseUrl(undefined)).toThrow(/not set/);
  });

  it('rejects an empty string URL', () => {
    expect(() => validateTestDatabaseUrl('')).toThrow(/not set/);
  });

  it('rejects empty APP_NODE_ENV', () => {
    process.env.APP_NODE_ENV = '';
    expect(() => validateTestDatabaseUrl(VALID_TEST_URL)).toThrow(/APP_NODE_ENV/);
  });

  it('rejects a remote/production host', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@prod-db.internal:5432/parks_test'),
    ).toThrow(/host/);
  });

  it('rejects a remote IP address', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@203.0.113.1:5432/parks_test'),
    ).toThrow(/host/);
  });

  it('rejects a database named without unambiguous test indication', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://parks:parks_dev@localhost:5432/parks_dev'),
    ).toThrow(/database name/);
  });

  it('rejects a database named just "postgres"', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://parks:parks_test@localhost:5433/postgres'),
    ).toThrow(/database name/);
  });

  it('rejects the development database URL', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://parks:parks_dev@localhost:5432/parks_dev'),
    ).toThrow(/database name/);
  });

  it('rejects a non-Postgres URL scheme', () => {
    expect(() => validateTestDatabaseUrl('mysql://user:pass@localhost/test')).toThrow(
      /postgres/,
    );
  });

  it('rejects a completely invalid string', () => {
    expect(() => validateTestDatabaseUrl('not-a-url')).toThrow(/postgres/);
  });

  // --- Spoofed names (contain "test" but aren't unambiguous) ---

  it('rejects database name "contest" (contains test but not unambiguous)', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432/contest'),
    ).toThrow(/database name/);
  });

  it('rejects database name "latest" (contains test but not unambiguous)', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432/latest'),
    ).toThrow(/database name/);
  });

  it('rejects database name "testatest" (contains test but not prefix/suffix)', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432/testatest'),
    ).toThrow(/database name/);
  });

  it('rejects database name "attest" (ends with attest, not _test)', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432/attest'),
    ).toThrow(/database name/);
  });

  // --- 0.0.0.0 rejection ---

  it('rejects 0.0.0.0 host (not a loopback address)', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@0.0.0.0:5432/parks_test'),
    ).toThrow(/host/);
  });

  // --- Malformed encoding and query parameters ---

  it('accepts a URL with query parameters (pathname still valid)', () => {
    // Query parameters do not alter the pathname in standard URL parsing,
    // so the database name 'parks_test' still passes the guard.
    expect(() =>
      validateTestDatabaseUrl(
        'postgres://user:pass@localhost:5432/parks_test?sslmode=require',
      ),
    ).not.toThrow();
  });

  // --- Credential redaction check ---

  it('does NOT include username, password, or full URL in error messages', () => {
    const secretUser = 'admin';
    const secretPass = 'superSecret123!';
    const maliciousUrl = `postgres://${secretUser}:${secretPass}@203.0.113.1:5432/parks_test`;

    try {
      validateTestDatabaseUrl(maliciousUrl);
      // If it doesn't throw, fail the test
      expect.fail('Should have thrown for remote host');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Must not contain the credentials
      expect(message).not.toContain(secretUser);
      expect(message).not.toContain(secretPass);
      // Must not contain the full URL
      expect(message).not.toContain(maliciousUrl);
      // Should contain host info
      expect(message).toContain('203.0.113.1');
    }
  });

  // --- IPv6 edge cases ---

  it('rejects IPv6 remote address', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@[2001:db8::1]:5432/parks_test'),
    ).toThrow(/host/);
  });

  // --- Non-HTTP URL edge cases ---

  it('rejects a URL with no path (no database name)', () => {
    // URL parser may treat this differently; it should fail
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432'),
    ).toThrow();
  });

  it('rejects a URL with empty database', () => {
    expect(() =>
      validateTestDatabaseUrl('postgres://user:pass@localhost:5432/'),
    ).toThrow();
  });
});
