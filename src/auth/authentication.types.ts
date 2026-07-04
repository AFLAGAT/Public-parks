import { z } from 'zod';
import { createZodDto } from '../common/validation/create-zod-dto.util';

const e164PhoneNumberSchema = z
  .string()
  .regex(/^\+[1-9][0-9]{7,14}$/, 'Phone number must use E.164 format.');

export const createOtpChallengeSchema = z
  .object({ phoneNumber: e164PhoneNumberSchema })
  .strict();
export class CreateOtpChallengeDto extends createZodDto(
  createOtpChallengeSchema,
) {
  declare readonly phoneNumber: string;
}

export const createResidentSessionSchema = z
  .object({
    challengeId: z.string().uuid(),
    otpCode: z.string().regex(/^[0-9]{6}$/),
    deviceName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export class CreateResidentSessionDto extends createZodDto(
  createResidentSessionSchema,
) {
  declare readonly challengeId: string;
  declare readonly otpCode: string;
  declare readonly deviceName?: string;
}

export const refreshResidentSessionSchema = z
  .object({ refreshToken: z.string().min(40).max(512) })
  .strict();
export class RefreshResidentSessionDto extends createZodDto(
  refreshResidentSessionSchema,
) {
  declare readonly refreshToken: string;
}

export const createSuperAdminChallengeSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(256),
  })
  .strict();
export class CreateSuperAdminChallengeDto extends createZodDto(
  createSuperAdminChallengeSchema,
) {
  declare readonly email: string;
  declare readonly password: string;
}

export const createSuperAdminSessionSchema = z
  .object({
    challengeId: z.string().uuid(),
    verificationCode: z.string().trim().min(6).max(64),
  })
  .strict();
export class CreateSuperAdminSessionDto extends createZodDto(
  createSuperAdminSessionSchema,
) {
  declare readonly challengeId: string;
  declare readonly verificationCode: string;
}

export const revokeSessionParamsSchema = z
  .object({ sessionId: z.string().uuid() })
  .strict();
export class RevokeSessionParamsDto extends createZodDto(
  revokeSessionParamsSchema,
) {
  declare readonly sessionId: string;
}

export interface AuthenticationTokensResponse {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken?: string;
  readonly refreshTokenExpiresAt: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface OtpChallengeResponse {
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly resendAvailableAt: string;
}

export interface SuperAdminChallengeResponse {
  readonly challengeId: string;
  readonly expiresAt: string;
}
