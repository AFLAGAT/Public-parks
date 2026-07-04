import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { verify as verifyTotp } from 'otplib';
import { Pool, type PoolClient } from 'pg';
import { DRIZZLE_POOL } from '../database/drizzle.module';
import { SecretHashService } from '../common/security/secret-hash.service';
import { FieldEncryptionService } from '../common/security/field-encryption.service';
import type { EncryptedFieldPayload } from '../database/drizzle.schema';
import type { AuthenticatedActor } from './authenticated-actors.types';
import { AuthenticationFailedException } from './authentication-failed.exception';

const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionResult {
  readonly userId: string;
  readonly sessionId: string;
  readonly clientType: AuthenticatedActor['clientType'];
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthenticationRepository {
  constructor(
    @Inject(DRIZZLE_POOL) private readonly pool: Pool,
    @Inject(SecretHashService) private readonly secretHash: SecretHashService,
    @Inject(FieldEncryptionService)
    private readonly fieldEncryption: FieldEncryptionService,
  ) {}

  async createOtpChallenge(input: {
    readonly challengeId: string;
    readonly phoneNumber: string;
    readonly codeDigest: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE otp_challenges
            SET challenge_status = 'invalidated', invalidated_at = now(), updated_at = now()
          WHERE phone_number = $1 AND challenge_status = 'pending'`,
        [input.phoneNumber],
      );
      await client.query(
        `INSERT INTO otp_challenges (id, phone_number, code_digest, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [
          input.challengeId,
          input.phoneNumber,
          input.codeDigest,
          input.expiresAt,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markOtpDeliveryFailed(challengeId: string): Promise<void> {
    await this.pool.query(
      `UPDATE otp_challenges
          SET challenge_status = 'delivery_failed', updated_at = now()
        WHERE id = $1 AND challenge_status = 'pending'`,
      [challengeId],
    );
  }

  async consumeOtpChallenge(input: {
    readonly challengeId: string;
    readonly otpCode: string;
    readonly deviceName?: string;
  }): Promise<SessionResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const challengeResult = await client.query<{
        phone_number: string;
        code_digest: string;
        challenge_status: string;
        attempt_count: number;
        expires_at: Date;
      }>(
        `SELECT phone_number, code_digest, challenge_status, attempt_count, expires_at
           FROM otp_challenges WHERE id = $1 FOR UPDATE`,
        [input.challengeId],
      );
      const challenge = challengeResult.rows[0];
      if (
        !challenge ||
        challenge.challenge_status !== 'pending' ||
        challenge.expires_at.getTime() <= Date.now() ||
        challenge.attempt_count >= 5
      ) {
        throw new AuthenticationFailedException();
      }

      const actualDigest = this.secretHash.hashOtp(
        input.challengeId,
        challenge.phone_number,
        input.otpCode,
      );
      if (!this.secretHash.isEqual(challenge.code_digest, actualDigest)) {
        await client.query(
          `UPDATE otp_challenges
              SET attempt_count = attempt_count + 1,
                  challenge_status = CASE WHEN attempt_count + 1 >= 5 THEN 'invalidated' ELSE challenge_status END,
                  invalidated_at = CASE WHEN attempt_count + 1 >= 5 THEN now() ELSE invalidated_at END,
                  updated_at = now()
            WHERE id = $1`,
          [input.challengeId],
        );
        await client.query('COMMIT');
        throw new AuthenticationFailedException();
      }

      await client.query(
        `UPDATE otp_challenges
            SET challenge_status = 'consumed', consumed_at = now(), updated_at = now()
          WHERE id = $1`,
        [input.challengeId],
      );
      const userResult = await client.query<{ id: string; is_active: boolean }>(
        `INSERT INTO users (phone_number, phone_number_verified_at)
         VALUES ($1, now())
         ON CONFLICT (phone_number) DO UPDATE
           SET phone_number_verified_at = COALESCE(users.phone_number_verified_at, now()),
               updated_at = now()
         RETURNING id, is_active`,
        [challenge.phone_number],
      );
      const user = userResult.rows[0];
      if (!user?.is_active) {
        throw new AuthenticationFailedException();
      }
      const session = await this.insertSession(
        client,
        user.id,
        'resident_mobile',
        input.deviceName,
      );
      await client.query('COMMIT');
      return session;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findSuperAdminPassword(email: string): Promise<{
    readonly userId: string;
    readonly passwordHash: string;
  } | null> {
    const result = await this.pool.query<{
      user_id: string;
      password_hash: string;
    }>(
      `SELECT u.id AS user_id, pc.password_hash
         FROM users u
         JOIN password_credentials pc ON pc.user_id = u.id
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE u.email = $1 AND u.is_active = true
          AND r.code = 'super_admin' AND r.is_active = true
        LIMIT 1`,
      [email],
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, passwordHash: row.password_hash } : null;
  }

  async consumeSuperAdminMfa(
    userId: string,
    verificationCode: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const factorResult = await client.query<{
        id: string;
        encrypted_secret: EncryptedFieldPayload;
        last_accepted_time_step: number | null;
      }>(
        `SELECT id, encrypted_secret, last_accepted_time_step
           FROM totp_factors WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const factor = factorResult.rows[0];
      if (!factor) {
        await client.query('ROLLBACK');
        return false;
      }

      let isValid = false;
      if (/^[0-9]{6}$/.test(verificationCode)) {
        const secret = this.fieldEncryption.decryptJson<string>(
          factor.encrypted_secret,
          `totp-factor:${factor.id}`,
        );
        const result = await verifyTotp({
          secret,
          token: verificationCode,
          epochTolerance: 30,
        });
        if (result.valid) {
          const timeStep = Math.floor(Date.now() / 1000 / 30) + (result.delta ?? 0);
          if (
            factor.last_accepted_time_step === null ||
            timeStep > factor.last_accepted_time_step
          ) {
            await client.query(
              `UPDATE totp_factors
                  SET last_accepted_time_step = $2, updated_at = now()
                WHERE id = $1`,
              [factor.id, timeStep],
            );
            isValid = true;
          }
        }
      } else {
        const recoveryHash = this.secretHash.hashToken(
          `recovery:${verificationCode}`,
        );
        const recoveryResult = await client.query(
          `UPDATE totp_recovery_codes
              SET used_at = now(), updated_at = now()
            WHERE totp_factor_id = $1 AND code_hash = $2 AND used_at IS NULL
            RETURNING id`,
          [factor.id, recoveryHash],
        );
        isValid = recoveryResult.rowCount === 1;
      }

      await client.query(isValid ? 'COMMIT' : 'ROLLBACK');
      return isValid;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createSuperAdminSession(userId: string): Promise<SessionResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const session = await this.insertSession(
        client,
        userId,
        'super_admin_web',
        'Super Admin Web',
      );
      await client.query('COMMIT');
      return session;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async rotateRefreshToken(refreshToken: string): Promise<SessionResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tokenHash = this.secretHash.hashToken(refreshToken);
      const result = await client.query<{
        token_id: string;
        refresh_token_status: string;
        token_expires_at: Date;
        session_id: string;
        user_id: string;
        client_type: AuthenticatedActor['clientType'];
        session_status: string;
        session_expires_at: Date;
        is_active: boolean;
      }>(
        `SELECT rt.id AS token_id, rt.refresh_token_status, rt.expires_at AS token_expires_at,
                s.id AS session_id, s.user_id, s.client_type, s.session_status,
                s.expires_at AS session_expires_at, u.is_active
           FROM refresh_tokens rt
           JOIN authentication_sessions s ON s.id = rt.authentication_session_id
           JOIN users u ON u.id = s.user_id
          WHERE rt.token_hash = $1 FOR UPDATE OF rt, s`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) {
        throw new AuthenticationFailedException();
      }
      if (
        row.refresh_token_status !== 'active' ||
        row.token_expires_at.getTime() <= Date.now()
      ) {
        await this.revokeSessionWithClient(client, row.session_id);
        await client.query('COMMIT');
        throw new AuthenticationFailedException();
      }
      if (
        row.session_status !== 'active' ||
        row.session_expires_at.getTime() <= Date.now() ||
        !row.is_active
      ) {
        throw new AuthenticationFailedException();
      }

      await client.query(
        `UPDATE refresh_tokens SET refresh_token_status = 'rotated', rotated_at = now(), updated_at = now()
          WHERE id = $1`,
        [row.token_id],
      );
      const replacement = await this.insertRefreshToken(client, row.session_id);
      await client.query('COMMIT');
      return {
        userId: row.user_id,
        sessionId: row.session_id,
        clientType: row.client_type,
        ...replacement,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRefreshTokenContext(refreshToken: string): Promise<{
    readonly sessionId: string;
    readonly clientType: AuthenticatedActor['clientType'];
  } | null> {
    const result = await this.pool.query<{
      session_id: string;
      client_type: AuthenticatedActor['clientType'];
    }>(
      `SELECT s.id AS session_id, s.client_type
         FROM refresh_tokens rt
         JOIN authentication_sessions s ON s.id = rt.authentication_session_id
        WHERE rt.token_hash = $1
        LIMIT 1`,
      [this.secretHash.hashToken(refreshToken)],
    );
    const row = result.rows[0];
    return row ? { sessionId: row.session_id, clientType: row.client_type } : null;
  }

  async getAuthenticatedActor(
    userId: string,
    sessionId: string,
    clientType: AuthenticatedActor['clientType'],
  ): Promise<AuthenticatedActor | null> {
    const result = await this.pool.query<{
      user_id: string;
      role_codes: string[];
      permission_codes: string[];
    }>(
      `SELECT s.user_id,
              COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS role_codes,
              COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permission_codes
         FROM authentication_sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id AND r.is_active = true
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.client_type = $3
          AND s.session_status = 'active' AND s.expires_at > now()
          AND u.is_active = true
        GROUP BY s.user_id`,
      [sessionId, userId, clientType],
    );
    const row = result.rows[0];
    return row
      ? {
          actorId: row.user_id,
          sessionId,
          clientType,
          roleCodes: row.role_codes,
          permissionCodes: row.permission_codes,
        }
      : null;
  }

  async revokeSession(sessionId: string, actorUserId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE authentication_sessions
          SET session_status = 'revoked', revoked_at = now(), updated_at = now()
        WHERE id = $1 AND user_id = $2 AND session_status = 'active'
        RETURNING id`,
      [sessionId, actorUserId],
    );
    if (result.rowCount === 1) {
      await this.pool.query(
        `UPDATE refresh_tokens SET refresh_token_status = 'revoked', updated_at = now()
          WHERE authentication_session_id = $1 AND refresh_token_status = 'active'`,
        [sessionId],
      );
    }
    return result.rowCount === 1;
  }

  private async insertSession(
    client: PoolClient,
    userId: string,
    clientType: AuthenticatedActor['clientType'],
    deviceName?: string,
  ): Promise<SessionResult> {
    const sessionId = randomUUID();
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);
    await client.query(
      `INSERT INTO authentication_sessions
        (id, user_id, client_type, device_name, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId, clientType, deviceName ?? null, refreshTokenExpiresAt],
    );
    const refresh = await this.insertRefreshToken(
      client,
      sessionId,
      refreshTokenExpiresAt,
    );
    return { userId, sessionId, clientType, ...refresh };
  }

  private async insertRefreshToken(
    client: PoolClient,
    sessionId: string,
    expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
  ): Promise<{
    readonly refreshToken: string;
    readonly refreshTokenExpiresAt: Date;
  }> {
    const refreshToken = randomBytes(48).toString('base64url');
    await client.query(
      `INSERT INTO refresh_tokens
        (authentication_session_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [sessionId, this.secretHash.hashToken(refreshToken), expiresAt],
    );
    return { refreshToken, refreshTokenExpiresAt: expiresAt };
  }

  private async revokeSessionWithClient(
    client: PoolClient,
    sessionId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE authentication_sessions
          SET session_status = 'revoked', revoked_at = now(), updated_at = now()
        WHERE id = $1`,
      [sessionId],
    );
    await client.query(
      `UPDATE refresh_tokens SET refresh_token_status = 'revoked', updated_at = now()
        WHERE authentication_session_id = $1`,
      [sessionId],
    );
  }
}
