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

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
