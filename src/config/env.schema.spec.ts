import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

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
