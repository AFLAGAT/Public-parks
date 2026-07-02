import { describe, expect, it } from 'vitest';
import {
  assertNoDevInfraValues,
  assertNoDevSecretPlaceholders,
  type DevInfraRegistryEntry,
  type Env,
  type SecretRegistryEntry,
  validateEnv,
} from './env.schema';

const VALID_DB_URL = 'postgres://parks:parks_dev@localhost:5432/parks_dev';

const baseEnv: Env = {
  APP_NODE_ENV: 'development',
  APP_PORT: 3000,
  LOG_LEVEL: 'info',
  DB_PRIMARY_URL: VALID_DB_URL,
  APP_ENABLE_DOCS: false,
};

describe('validateEnv', () => {
  it('parses a minimal valid env and applies defaults', () => {
    const env = validateEnv({ APP_NODE_ENV: 'development', DB_PRIMARY_URL: VALID_DB_URL });
    expect(env.APP_NODE_ENV).toBe('development');
    expect(env.APP_PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DB_PRIMARY_URL).toBe(VALID_DB_URL);
    expect(env.APP_ENABLE_DOCS).toBe(false);
  });

  it('coerces APP_PORT from string', () => {
    const env = validateEnv({
      APP_NODE_ENV: 'development',
      APP_PORT: '8080',
      DB_PRIMARY_URL: VALID_DB_URL,
    });
    expect(env.APP_PORT).toBe(8080);
  });

  it('rejects a missing APP_NODE_ENV', () => {
    expect(() => validateEnv({})).toThrow(/APP_NODE_ENV/);
  });

  it('rejects an unknown APP_NODE_ENV value', () => {
    expect(() => validateEnv({ APP_NODE_ENV: 'qa', DB_PRIMARY_URL: VALID_DB_URL })).toThrow(
      /APP_NODE_ENV/,
    );
  });

  it('rejects a non-numeric APP_PORT', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        APP_PORT: 'not-a-port',
        DB_PRIMARY_URL: VALID_DB_URL,
      }),
    ).toThrow(/APP_PORT/);
  });

  it('rejects an out-of-range APP_PORT', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        APP_PORT: '70000',
        DB_PRIMARY_URL: VALID_DB_URL,
      }),
    ).toThrow(/APP_PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        LOG_LEVEL: 'verbose',
        DB_PRIMARY_URL: VALID_DB_URL,
      }),
    ).toThrow(/LOG_LEVEL/);
  });

  it('rejects a missing DB_PRIMARY_URL', () => {
    expect(() => validateEnv({ APP_NODE_ENV: 'development' })).toThrow(/DB_PRIMARY_URL/);
  });

  it('rejects a non-postgres DB_PRIMARY_URL', () => {
    expect(() =>
      validateEnv({ APP_NODE_ENV: 'development', DB_PRIMARY_URL: 'mysql://localhost/db' }),
    ).toThrow(/DB_PRIMARY_URL/);
  });

  it('accepts the postgresql:// scheme', () => {
    const env = validateEnv({
      APP_NODE_ENV: 'development',
      DB_PRIMARY_URL: 'postgresql://parks:parks_dev@localhost:5432/parks_dev',
    });
    expect(env.DB_PRIMARY_URL.startsWith('postgresql://')).toBe(true);
  });

  it('defaults APP_ENABLE_DOCS to false', () => {
    const env = validateEnv({ APP_NODE_ENV: 'development', DB_PRIMARY_URL: VALID_DB_URL });
    expect(env.APP_ENABLE_DOCS).toBe(false);
  });

  it('coerces APP_ENABLE_DOCS from string "true"', () => {
    const env = validateEnv({
      APP_NODE_ENV: 'development',
      DB_PRIMARY_URL: VALID_DB_URL,
      APP_ENABLE_DOCS: 'true',
    });
    expect(env.APP_ENABLE_DOCS).toBe(true);
  });

  it('coerces APP_ENABLE_DOCS from "1"', () => {
    const env = validateEnv({
      APP_NODE_ENV: 'development',
      DB_PRIMARY_URL: VALID_DB_URL,
      APP_ENABLE_DOCS: '1',
    });
    expect(env.APP_ENABLE_DOCS).toBe(true);
  });

  it('interprets "false" string for APP_ENABLE_DOCS', () => {
    const env = validateEnv({
      APP_NODE_ENV: 'development',
      DB_PRIMARY_URL: VALID_DB_URL,
      APP_ENABLE_DOCS: 'false',
    });
    expect(env.APP_ENABLE_DOCS).toBe(false);
  });

  it('accepts APP_ENABLE_DOCS as literal "0"', () => {
    const env = validateEnv({
      APP_NODE_ENV: 'development',
      DB_PRIMARY_URL: VALID_DB_URL,
      APP_ENABLE_DOCS: '0',
    });
    expect(env.APP_ENABLE_DOCS).toBe(false);
  });

  it('accepts APP_ENABLE_DOCS as boolean true', () => {
    const env = validateEnv({
      APP_NODE_ENV: 'development',
      DB_PRIMARY_URL: VALID_DB_URL,
      APP_ENABLE_DOCS: true,
    });
    expect(env.APP_ENABLE_DOCS).toBe(true);
  });

  it('rejects malformed APP_ENABLE_DOCS value "yes"', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        DB_PRIMARY_URL: VALID_DB_URL,
        APP_ENABLE_DOCS: 'yes',
      }),
    ).toThrow(/APP_ENABLE_DOCS/);
  });

  it('rejects malformed APP_ENABLE_DOCS value "treu"', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        DB_PRIMARY_URL: VALID_DB_URL,
        APP_ENABLE_DOCS: 'treu',
      }),
    ).toThrow(/APP_ENABLE_DOCS/);
  });

  it('rejects empty string for APP_ENABLE_DOCS', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        DB_PRIMARY_URL: VALID_DB_URL,
        APP_ENABLE_DOCS: '',
      }),
    ).toThrow(/APP_ENABLE_DOCS/);
  });

  it('rejects unsupported number 2 for APP_ENABLE_DOCS', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        DB_PRIMARY_URL: VALID_DB_URL,
        APP_ENABLE_DOCS: 2,
      }),
    ).toThrow(/APP_ENABLE_DOCS/);
  });

  it('rejects unsupported number -1 for APP_ENABLE_DOCS', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        DB_PRIMARY_URL: VALID_DB_URL,
        APP_ENABLE_DOCS: -1,
      }),
    ).toThrow(/APP_ENABLE_DOCS/);
  });

  it('rejects "TRUE" (uppercase) for APP_ENABLE_DOCS', () => {
    expect(() =>
      validateEnv({
        APP_NODE_ENV: 'development',
        DB_PRIMARY_URL: VALID_DB_URL,
        APP_ENABLE_DOCS: 'TRUE',
      }),
    ).toThrow(/APP_ENABLE_DOCS/);
  });

});

describe('assertNoDevSecretPlaceholders', () => {
  const fakeSecret: SecretRegistryEntry = {
    key: 'APP_PORT',
    devPlaceholders: ['changeme', '0000'],
  };

  it('skips the check in development', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { ...baseEnv, APP_NODE_ENV: 'development' },
        [{ ...fakeSecret, devPlaceholders: ['3000'] }],
      ),
    ).not.toThrow();
  });

  it('skips the check in test', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { ...baseEnv, APP_NODE_ENV: 'test' },
        [{ ...fakeSecret, devPlaceholders: ['3000'] }],
      ),
    ).not.toThrow();
  });

  it('throws in production when a registered secret holds a placeholder', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { ...baseEnv, APP_NODE_ENV: 'production', APP_PORT: 'changeme' as unknown as number },
        [fakeSecret],
      ),
    ).toThrow(/APP_PORT/);
  });

  it('throws in staging the same way', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { ...baseEnv, APP_NODE_ENV: 'staging', APP_PORT: 'changeme' as unknown as number },
        [fakeSecret],
      ),
    ).toThrow(/staging/);
  });

  it('passes in production when no registered secret matches a placeholder', () => {
    expect(() =>
      assertNoDevSecretPlaceholders(
        { ...baseEnv, APP_NODE_ENV: 'production', APP_PORT: 8080 },
        [fakeSecret],
      ),
    ).not.toThrow();
  });

  it('catches a copy-pasted dev DB_PRIMARY_URL in production via the real registry', () => {
    expect(() =>
      assertNoDevSecretPlaceholders({
        ...baseEnv,
        APP_NODE_ENV: 'production',
        DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_dev',
      }),
    ).toThrow(/DB_PRIMARY_URL/);
  });
});

describe('assertNoDevInfraValues', () => {
  const fakeInfra: DevInfraRegistryEntry = {
    key: 'APP_PORT',
    patterns: [/localhost/i, /127\.0\.0\.1/, /host\.docker\.internal/i],
  };

  it('skips the check in development', () => {
    expect(() =>
      assertNoDevInfraValues(
        {
          ...baseEnv,
          APP_NODE_ENV: 'development',
          APP_PORT: 'postgres://localhost/db' as unknown as number,
        },
        [fakeInfra],
      ),
    ).not.toThrow();
  });

  it('throws in production when a registered variable points at localhost', () => {
    expect(() =>
      assertNoDevInfraValues(
        {
          ...baseEnv,
          APP_NODE_ENV: 'production',
          APP_PORT: 'postgres://localhost:5432/db' as unknown as number,
          DB_PRIMARY_URL: 'postgres://prod-db.internal:5432/parks',
        },
        [fakeInfra],
      ),
    ).toThrow(/APP_PORT/);
  });

  it('throws in staging when a registered variable points at 127.0.0.1', () => {
    expect(() =>
      assertNoDevInfraValues(
        {
          ...baseEnv,
          APP_NODE_ENV: 'staging',
          APP_PORT: 'redis://127.0.0.1:6379' as unknown as number,
          DB_PRIMARY_URL: 'postgres://prod-db.internal:5432/parks',
        },
        [fakeInfra],
      ),
    ).toThrow(/staging/);
  });

  it('passes in production when no registered variable matches a dev pattern', () => {
    expect(() =>
      assertNoDevInfraValues(
        {
          ...baseEnv,
          APP_NODE_ENV: 'production',
          APP_PORT: 'postgres://prod-db.internal:5432/parks' as unknown as number,
          DB_PRIMARY_URL: 'postgres://prod-db.internal:5432/parks',
        },
        [fakeInfra],
      ),
    ).not.toThrow();
  });

  it('catches a localhost DB_PRIMARY_URL in production via the real registry', () => {
    expect(() =>
      assertNoDevInfraValues({
        ...baseEnv,
        APP_NODE_ENV: 'production',
        DB_PRIMARY_URL: 'postgres://user:pass@localhost:5432/whatever',
      }),
    ).toThrow(/DB_PRIMARY_URL/);
  });

  it('catches a 127.0.0.1 DB_PRIMARY_URL in staging via the real registry', () => {
    expect(() =>
      assertNoDevInfraValues({
        ...baseEnv,
        APP_NODE_ENV: 'staging',
        DB_PRIMARY_URL: 'postgres://user:pass@127.0.0.1:5432/whatever',
      }),
    ).toThrow(/DB_PRIMARY_URL/);
  });
});
