import { describe, expect, it } from 'vitest';
import {
  assertNoDevInfraValues,
  assertNoDevSecretPlaceholders,
  DevInfraRegistryEntry,
  SecretRegistryEntry,
  validateEnv,
} from './env.schema';

describe('validateEnv', () => {
  it('parses a minimal valid env and applies defaults', () => {
    const env = validateEnv({ APP_NODE_ENV: 'development' });
    expect(env.APP_NODE_ENV).toBe('development');
    expect(env.APP_PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces APP_PORT from string', () => {
    const env = validateEnv({ APP_NODE_ENV: 'production', APP_PORT: '8080' });
    expect(env.APP_PORT).toBe(8080);
  });

  it('rejects a missing APP_NODE_ENV', () => {
    expect(() => validateEnv({})).toThrow(/APP_NODE_ENV/);
  });

  it('rejects an unknown APP_NODE_ENV value', () => {
    expect(() => validateEnv({ APP_NODE_ENV: 'qa' })).toThrow(/APP_NODE_ENV/);
  });

  it('rejects a non-numeric APP_PORT', () => {
    expect(() => validateEnv({ APP_NODE_ENV: 'development', APP_PORT: 'not-a-port' })).toThrow(
      /APP_PORT/,
    );
  });

  it('rejects an out-of-range APP_PORT', () => {
    expect(() => validateEnv({ APP_NODE_ENV: 'development', APP_PORT: '70000' })).toThrow(
      /APP_PORT/,
    );
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => validateEnv({ APP_NODE_ENV: 'development', LOG_LEVEL: 'verbose' })).toThrow(
      /LOG_LEVEL/,
    );
  });
});

describe('assertNoDevSecretPlaceholders', () => {
  // The real registry is empty; tests pass a synthetic registry that pretends
  // APP_PORT is a secret with known placeholders, just to exercise the guard.
  const fakeSecret: SecretRegistryEntry = {
    key: 'APP_PORT',
    devPlaceholders: ['changeme', '0000'],
  };

  it('skips the check in development', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { APP_NODE_ENV: 'development', APP_PORT: 3000, LOG_LEVEL: 'info' },
        [{ ...fakeSecret, devPlaceholders: ['3000'] }],
      ),
    ).not.toThrow();
  });

  it('skips the check in test', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { APP_NODE_ENV: 'test', APP_PORT: 3000, LOG_LEVEL: 'info' },
        [{ ...fakeSecret, devPlaceholders: ['3000'] }],
      ),
    ).not.toThrow();
  });

  it('throws in production when a registered secret holds a placeholder', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        // Cast: APP_PORT is a number; we simulate a string-typed secret holding
        // its placeholder, which is the real shape (DB urls, JWT keys, etc.).
        { APP_NODE_ENV: 'production', APP_PORT: 'changeme', LOG_LEVEL: 'info' } as unknown as Parameters<
          typeof assertNoDevSecretPlaceholders
        >[0],
        [fakeSecret],
      ),
    ).toThrow(/APP_PORT/);
  });

  it('throws in staging the same way', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { APP_NODE_ENV: 'staging', APP_PORT: 'changeme', LOG_LEVEL: 'info' } as unknown as Parameters<
          typeof assertNoDevSecretPlaceholders
        >[0],
        [fakeSecret],
      ),
    ).toThrow(/staging/);
  });

  it('passes in production when no registered secret matches a placeholder', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { APP_NODE_ENV: 'production', APP_PORT: 8080, LOG_LEVEL: 'info' },
        [fakeSecret],
      ),
    ).not.toThrow();
  });

  it('passes with the default empty registry', () => {
    expect(() =>
      assertNoDevSecretPlaceholders({
        APP_NODE_ENV: 'production',
        APP_PORT: 8080,
        LOG_LEVEL: 'info',
      }),
    ).not.toThrow();
  });
});

describe('assertNoDevInfraValues', () => {
  // Synthetic registry pretending APP_PORT (a string-typed value, in this
  // mock) is a connection string that must not point at localhost.
  const fakeInfra: DevInfraRegistryEntry = {
    key: 'APP_PORT',
    patterns: [/localhost/i, /127\.0\.0\.1/, /host\.docker\.internal/i],
  };

  it('skips the check in development', () => {
    expect(() =>
      assertNoDevInfraValues(
        { APP_NODE_ENV: 'development', APP_PORT: 'postgres://localhost/db' } as unknown as Parameters<
          typeof assertNoDevInfraValues
        >[0],
        [fakeInfra],
      ),
    ).not.toThrow();
  });

  it('throws in production when a registered variable points at localhost', () => {
    expect(() =>
      assertNoDevInfraValues(
        {
          APP_NODE_ENV: 'production',
          APP_PORT: 'postgres://localhost:5432/db',
          LOG_LEVEL: 'info',
        } as unknown as Parameters<typeof assertNoDevInfraValues>[0],
        [fakeInfra],
      ),
    ).toThrow(/APP_PORT/);
  });

  it('throws in staging when a registered variable points at 127.0.0.1', () => {
    expect(() =>
      assertNoDevInfraValues(
        {
          APP_NODE_ENV: 'staging',
          APP_PORT: 'redis://127.0.0.1:6379',
          LOG_LEVEL: 'info',
        } as unknown as Parameters<typeof assertNoDevInfraValues>[0],
        [fakeInfra],
      ),
    ).toThrow(/staging/);
  });

  it('passes in production when no registered variable matches a dev pattern', () => {
    expect(() =>
      assertNoDevInfraValues(
        {
          APP_NODE_ENV: 'production',
          APP_PORT: 'postgres://prod-db.internal:5432/parks',
          LOG_LEVEL: 'info',
        } as unknown as Parameters<typeof assertNoDevInfraValues>[0],
        [fakeInfra],
      ),
    ).not.toThrow();
  });

  it('passes with the default empty registry', () => {
    expect(() =>
      assertNoDevInfraValues({
        APP_NODE_ENV: 'production',
        APP_PORT: 8080,
        LOG_LEVEL: 'info',
      }),
    ).not.toThrow();
  });
});
