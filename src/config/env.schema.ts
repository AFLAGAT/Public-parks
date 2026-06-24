import { z } from 'zod';

export const APP_NODE_ENVS = ['development', 'staging', 'production', 'test'] as const;
export type AppNodeEnv = (typeof APP_NODE_ENVS)[number];

const appEnvSchema = z.object({
  APP_NODE_ENV: z.enum(APP_NODE_ENVS, {
    errorMap: () => ({ message: `APP_NODE_ENV must be one of ${APP_NODE_ENVS.join(', ')}` }),
  }),
  APP_PORT: z.coerce.number().int().positive().max(65535).default(3000),
});

const logEnvSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const envSchema = appEnvSchema.merge(logEnvSchema);
export type Env = z.infer<typeof envSchema>;

/**
 * Registry of variables treated as secrets. Each entry's `devPlaceholders` are
 * checked against the parsed env value when `APP_NODE_ENV` is `staging` or
 * `production` — any match refuses startup with a per-variable error.
 *
 * Empty for now. Each later Phase 2 item that introduces a secret (e.g.
 * `DB_PRIMARY_URL`, `JWT_SIGNING_KEY`, `TELEBIRR_APP_SECRET`,
 * `TELEBIRR_RSA_PRIVATE_KEY`, object storage credentials) appends its own
 * entry here as part of that item's checklist work.
 */
export interface SecretRegistryEntry {
  readonly key: keyof Env;
  readonly devPlaceholders: readonly string[];
}

export const SECRET_REGISTRY: readonly SecretRegistryEntry[] = [];

export function assertNoDevSecretPlaceholders(
  env: Env,
  registry: readonly SecretRegistryEntry[] = SECRET_REGISTRY,
): void {
  if (env.APP_NODE_ENV !== 'production' && env.APP_NODE_ENV !== 'staging') {
    return;
  }
  const offenders: string[] = [];
  for (const entry of registry) {
    const value = env[entry.key];
    if (typeof value !== 'string') {
      continue;
    }
    if (entry.devPlaceholders.includes(value)) {
      offenders.push(String(entry.key));
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `Refusing to boot in ${env.APP_NODE_ENV}: the following secrets still hold known development placeholder values: ${offenders.join(', ')}. Rotate them via the deployment platform's secret store before starting.`,
    );
  }
}

/**
 * Registry of variables whose values must NOT point at development
 * infrastructure when running in `staging` or `production`. Each entry pairs
 * an env variable with regex patterns indicating "this is a dev/local value."
 *
 * Empty for now. Each later Phase 2 item that introduces a connection string
 * (e.g. `DB_PRIMARY_URL`, `REDIS_URL`, `STORAGE_ENDPOINT`) appends its own
 * entry — typically matching `localhost`, `127.0.0.1`, `0.0.0.0`,
 * `host.docker.internal`, or known sandbox hostnames.
 */
export interface DevInfraRegistryEntry {
  readonly key: keyof Env;
  readonly patterns: readonly RegExp[];
}

export const DEV_INFRA_REGISTRY: readonly DevInfraRegistryEntry[] = [];

export function assertNoDevInfraValues(
  env: Env,
  registry: readonly DevInfraRegistryEntry[] = DEV_INFRA_REGISTRY,
): void {
  if (env.APP_NODE_ENV !== 'production' && env.APP_NODE_ENV !== 'staging') {
    return;
  }
  const offenders: string[] = [];
  for (const entry of registry) {
    const value = env[entry.key];
    if (typeof value !== 'string') {
      continue;
    }
    if (entry.patterns.some((pattern) => pattern.test(value))) {
      offenders.push(String(entry.key));
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `Refusing to boot in ${env.APP_NODE_ENV}: the following variables point at development infrastructure: ${offenders.join(', ')}. Use the ${env.APP_NODE_ENV} environment's own credentials and endpoints.`,
    );
  }
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertNoDevSecretPlaceholders(result.data);
  assertNoDevInfraValues(result.data);
  return result.data;
}
