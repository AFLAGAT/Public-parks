import { z } from 'zod';
import { createZodDto } from '../common/validation/create-zod-dto.util';
import type { EncryptedFieldPayload } from '../database/drizzle.schema';

const e164Schema = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const credentialsSchema = z.record(z.string().min(1).max(80), z.string().max(4096));

export const createSmsConfigurationSchema = z
  .object({
    providerKey: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
    displayName: z.string().trim().min(1).max(120),
    apiUrl: z.string().url().max(2048).nullable().optional(),
    credentials: credentialsSchema.default({}),
    senderId: z.string().trim().min(1).max(40).nullable().optional(),
    timeoutMs: z.number().int().min(1000).max(30_000).default(10_000),
    retryCount: z.number().int().min(0).max(3).default(1),
    isEnabled: z.boolean().default(false),
  })
  .strict();
export class CreateSmsConfigurationDto extends createZodDto(
  createSmsConfigurationSchema,
) {
  declare readonly providerKey: string;
  declare readonly displayName: string;
  declare readonly apiUrl?: string | null;
  declare readonly credentials: Record<string, string>;
  declare readonly senderId?: string | null;
  declare readonly timeoutMs: number;
  declare readonly retryCount: number;
  declare readonly isEnabled: boolean;
}

export const patchSmsConfigurationSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0);
export class PatchSmsConfigurationDto extends createZodDto(
  patchSmsConfigurationSchema,
) {
  declare readonly displayName?: string;
  declare readonly isEnabled?: boolean;
}

export const createSmsRevisionSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    apiUrl: z.string().url().max(2048).nullable().optional(),
    credentials: credentialsSchema.optional(),
    senderId: z.string().trim().min(1).max(40).nullable().optional(),
    timeoutMs: z.number().int().min(1000).max(30_000).optional(),
    retryCount: z.number().int().min(0).max(3).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0);
export class CreateSmsRevisionDto extends createZodDto(createSmsRevisionSchema) {
  declare readonly displayName?: string;
  declare readonly apiUrl?: string | null;
  declare readonly credentials?: Record<string, string>;
  declare readonly senderId?: string | null;
  declare readonly timeoutMs?: number;
  declare readonly retryCount?: number;
  declare readonly isEnabled?: boolean;
}

export const testSmsConfigurationSchema = z
  .object({ destination: e164Schema })
  .strict();
export class TestSmsConfigurationDto extends createZodDto(
  testSmsConfigurationSchema,
) {
  declare readonly destination: string;
}

export const smsConfigurationParamsSchema = z
  .object({ smsProviderConfigurationId: z.string().uuid() })
  .strict();
export class SmsConfigurationParamsDto extends createZodDto(
  smsConfigurationParamsSchema,
) {
  declare readonly smsProviderConfigurationId: string;
}

export type CreateSmsConfigurationInput = z.infer<typeof createSmsConfigurationSchema>;
export type PatchSmsConfigurationInput = z.infer<typeof patchSmsConfigurationSchema>;
export type CreateSmsRevisionInput = z.infer<typeof createSmsRevisionSchema>;

export interface SmsConfigurationRecord {
  readonly id: string;
  readonly scopeType: 'platform' | 'city';
  readonly scopeId: string | null;
  readonly providerKey: string;
  readonly displayName: string;
  readonly apiUrl: string | null;
  readonly encryptedCredentials: EncryptedFieldPayload;
  readonly senderId: string | null;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly isEnabled: boolean;
  readonly isActive: boolean;
  readonly revision: number;
  readonly lastSuccessfulTestRevision: number | null;
  readonly activatedAt: Date | null;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
