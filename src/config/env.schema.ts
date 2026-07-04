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

const dbEnvSchema = z.object({
  DB_PRIMARY_URL: z
    .string()
    .min(1, 'DB_PRIMARY_URL is required')
    .refine(
      (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
      { message: 'DB_PRIMARY_URL must be a postgres:// or postgresql:// connection string' },
    ),
});

const redisEnvSchema = z.object({
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .refine(
      (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
      { message: 'REDIS_URL must be a redis:// or rediss:// connection string' },
    )
    .default('redis://localhost:6379/0'),
});

const DEVELOPMENT_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const DEVELOPMENT_KEY_RING = `{"dev-v1":"${DEVELOPMENT_KEY}"}`;

const base64KeySchema = z.string().refine((value) => {
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}, 'Key must be a base64-encoded 32-byte value.');

const keyRingSchema = z.string().superRefine((value, context) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    const result = z.record(z.string().min(1), base64KeySchema).safeParse(parsed);
    if (!result.success || Object.keys(result.data).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Key ring must be a non-empty JSON object of base64 32-byte keys.',
      });
    }
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Key ring must be valid JSON.',
    });
  }
});

const securityEnvSchema = z.object({
  AUTH_JWT_KEYS_JSON: keyRingSchema.default(DEVELOPMENT_KEY_RING),
  AUTH_JWT_ACTIVE_KEY_ID: z.string().min(1).max(80).default('dev-v1'),
  AUTH_OTP_HASH_KEY: base64KeySchema.default(DEVELOPMENT_KEY),
  AUTH_TOKEN_HASH_KEY: base64KeySchema.default(DEVELOPMENT_KEY),
  AUTH_CSRF_KEY: base64KeySchema.default(DEVELOPMENT_KEY),
  APP_FIELD_ENCRYPTION_KEYS_JSON: keyRingSchema.default(DEVELOPMENT_KEY_RING),
  APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1).max(80).default('dev-v1'),
  SUPER_ADMIN_WEB_ORIGINS: z
    .string()
    .min(1)
    .superRefine((value, context) => {
      for (const origin of value.split(',').map((entry) => entry.trim())) {
        try {
          const parsed = new URL(origin);
          if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Invalid origin');
          }
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'SUPER_ADMIN_WEB_ORIGINS must contain comma-separated HTTP(S) origins without paths or wildcards.',
          });
          break;
        }
      }
    })
    .default('http://localhost:3001'),
  DEV_SMS_INBOX_TOKEN: z.string().max(512).default(''),
});

/**
 * Coerces a boolean-compatible value from supported forms:
 *   boolean: true, false
 *   string:  'true', 'false', '1', '0'
 *
 * Rejects malformed values such as 'yes', 'treu', empty strings, and
 * unsupported numbers. This ensures APP_ENABLE_DOCS and any future
 * boolean env vars fail loudly instead of silently coercing to false.
 */
const coerceBoolean = z
  .union([
    z.boolean(),
    z.literal('true').transform(() => true as const),
    z.literal('false').transform(() => false as const),
    z.literal('1').transform(() => true as const),
    z.literal('0').transform(() => false as const),
  ]);

const docsEnvSchema = z.object({
  APP_ENABLE_DOCS: coerceBoolean.default(false),
});

export const envSchema = appEnvSchema
  .merge(logEnvSchema)
  .merge(dbEnvSchema)
  .merge(redisEnvSchema)
  .merge(securityEnvSchema)
  .merge(docsEnvSchema)
  .superRefine((env, context) => {
    for (const [ringField, activeField] of [
      ['AUTH_JWT_KEYS_JSON', 'AUTH_JWT_ACTIVE_KEY_ID'],
      ['APP_FIELD_ENCRYPTION_KEYS_JSON', 'APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID'],
    ] as const) {
      try {
        const ring = JSON.parse(env[ringField]) as Record<string, unknown>;
        if (!(env[activeField] in ring)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [activeField],
            message: `${activeField} must identify a key in ${ringField}.`,
          });
        }
      } catch {
        // The field-local key-ring validation reports malformed JSON.
      }
    }
  });
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

export const SECRET_REGISTRY: readonly SecretRegistryEntry[] = [
  {
    key: 'AUTH_JWT_KEYS_JSON',
    devPlaceholders: [DEVELOPMENT_KEY_RING],
  },
  {
    // Catch a copy-pasted local-dev DB URL landing in staging/production.
    // Both the project's docker-compose URL and the Postgres default URL are
    // listed; matching is exact-string. The DEV_INFRA_REGISTRY entry below
    // catches any `localhost`-bearing URL more generally; this entry adds a
    // belt to the suspenders.
    key: 'DB_PRIMARY_URL',
    devPlaceholders: [
      'postgres://parks:parks_dev@localhost:5432/parks_dev',
      'postgresql://parks:parks_dev@localhost:5432/parks_dev',
      'postgres://postgres:postgres@localhost:5432/postgres',
    ],
  },
  {
    key: 'AUTH_OTP_HASH_KEY',
    devPlaceholders: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
  },
  {
    key: 'AUTH_TOKEN_HASH_KEY',
    devPlaceholders: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
  },
  {
    key: 'AUTH_CSRF_KEY',
    devPlaceholders: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
  },
  {
    key: 'APP_FIELD_ENCRYPTION_KEYS_JSON',
    devPlaceholders: [DEVELOPMENT_KEY_RING],
  },
];

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

export const DEV_INFRA_REGISTRY: readonly DevInfraRegistryEntry[] = [
  {
    key: 'DB_PRIMARY_URL',
    patterns: [/localhost/i, /127\.0\.0\.1/, /host\.docker\.internal/i],
  },
  {
    key: 'REDIS_URL',
    patterns: [/localhost/i, /127\.0\.0\.1/, /host\.docker\.internal/i],
  },
];

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
