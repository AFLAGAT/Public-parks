import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash, argon2id } from 'argon2';
import { generate, generateSecret } from 'otplib';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { DRIZZLE_POOL } from '../../../src/database/drizzle.module';
import { FieldEncryptionService } from '../../../src/common/security/field-encryption.service';
import { JwtTokenService } from '../../../src/auth/jwt-token.service';
import { MockSmsProvider } from '../../../src/notifications/mock-sms.provider';
import { RedisService } from '../../../src/common/redis/redis.service';

interface ErrorBody {
  readonly error: { readonly code: string };
}

describe('authentication and SMS HTTP integration', () => {
  const adminId = randomUUID();
  const smsConfigurationId = randomUUID();
  const adminEmail = `platform-admin-${adminId}@example.com`;
  const adminPassword = 'Integration-only-password-123!';
  const totpSecret = generateSecret();
  let app: INestApplication;
  let pool: Pool;
  let redis: RedisService;
  let mockProvider: MockSmsProvider;
  let jwtTokens: JwtTokenService;
  let baseUrl: string;
  let adminAccessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()).replace('0.0.0.0', '127.0.0.1');
    pool = app.get<Pool>(DRIZZLE_POOL);
    redis = app.get(RedisService);
    mockProvider = app.get(MockSmsProvider);
    jwtTokens = app.get(JwtTokenService);
    await redis.ensureConnected();
    await redis.client.flushDb();

    const factorId = randomUUID();
    const encryption = app.get(FieldEncryptionService);
    await pool.query(
      `INSERT INTO users (id, email, email_verified_at) VALUES ($1, $2, now())`,
      [adminId, adminEmail],
    );
    await pool.query(
      `INSERT INTO password_credentials (user_id, password_hash) VALUES ($1, $2)`,
      [adminId, await hash(adminPassword, { type: argon2id })],
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code = 'super_admin'`,
      [adminId],
    );
    await pool.query(
      `INSERT INTO totp_factors (id, user_id, encrypted_secret) VALUES ($1, $2, $3)`,
      [
        factorId,
        adminId,
        encryption.encryptJson(totpSecret, `totp-factor:${factorId}`),
      ],
    );
    await pool.query(
      `INSERT INTO sms_provider_configurations
        (id, provider_key, display_name, encrypted_credentials, is_enabled,
         is_active, revision, last_successful_test_revision, activated_at,
         created_by_user_id, updated_by_user_id)
       VALUES ($1, 'mock', 'Integration Mock', $2, true, true, 1, 1, now(), $3, $3)`,
      [
        smsConfigurationId,
        encryption.encryptJson(
          {},
          `sms-provider-configuration:${smsConfigurationId}:revision:1`,
        ),
        adminId,
      ],
    );
  }, 30_000);

  afterAll(async () => {
    if (pool) {
      await pool.query(
        `DELETE FROM sms_provider_tests WHERE sms_provider_configuration_id = $1`,
        [smsConfigurationId],
      );
      await pool.query(
        `DELETE FROM sms_delivery_attempts WHERE sms_provider_configuration_id = $1`,
        [smsConfigurationId],
      );
      await pool.query(`DELETE FROM sms_provider_configurations WHERE id = $1`, [
        smsConfigurationId,
      ]);
      await pool.query(
        `DELETE FROM users WHERE id = $1 OR email LIKE 'denied-actor-%@example.com'`,
        [adminId],
      );
    }
    if (redis) await redis.client.flushDb();
    if (app) await app.close();
  });

  it('issues resident sessions from digest-only OTPs and revokes on refresh reuse', async () => {
    const phoneNumber = '+12025550123';
    const challengeResponse = await fetch(`${baseUrl}/v1/auth/otp-challenges`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    expect(challengeResponse.status).toBe(201);
    const challenge = (await challengeResponse.json()) as { challengeId: string };
    const inboxMessage = mockProvider
      .getMessages()
      .find((message) => message.destination === phoneNumber);
    const otpCode = inboxMessage?.message.match(/code is ([0-9]{6})/)?.[1];
    expect(otpCode).toMatch(/^[0-9]{6}$/);

    const persisted = await pool.query<{ code_digest: string }>(
      `SELECT code_digest FROM otp_challenges WHERE id = $1`,
      [challenge.challengeId],
    );
    expect(persisted.rows[0]?.code_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(persisted.rows[0]?.code_digest).not.toContain(otpCode as string);

    const sessionResponse = await fetch(`${baseUrl}/v1/auth/resident-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.challengeId, otpCode }),
    });
    expect(sessionResponse.status).toBe(201);
    const session = (await sessionResponse.json()) as {
      accessToken: string;
      refreshToken: string;
      sessionId: string;
    };

    const replayResponse = await fetch(`${baseUrl}/v1/auth/resident-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.challengeId, otpCode }),
    });
    expect(replayResponse.status).toBe(401);

    const denied = await fetch(`${baseUrl}/v1/sms-provider-implementations`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as ErrorBody).error.code).toBe('PERMISSION_DENIED');

    const refreshResponse = await fetch(
      `${baseUrl}/v1/auth/resident-session-refreshes`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      },
    );
    expect(refreshResponse.status).toBe(201);

    const reuseResponse = await fetch(
      `${baseUrl}/v1/auth/resident-session-refreshes`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      },
    );
    expect(reuseResponse.status).toBe(401);
    const sessionState = await pool.query<{ session_status: string }>(
      `SELECT session_status FROM authentication_sessions WHERE id = $1`,
      [session.sessionId],
    );
    expect(sessionState.rows[0]?.session_status).toBe('revoked');
  });

  it('enforces resend cooldown, OTP expiry/attempt exhaustion, and provider outage', async () => {
    const createChallenge = async (phoneNumber: string) => {
      const response = await fetch(`${baseUrl}/v1/auth/otp-challenges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      return { response, body: (await response.json()) as { challengeId: string } };
    };
    const findCode = (phoneNumber: string): string => {
      const code = mockProvider
        .getMessages()
        .find((message) => message.destination === phoneNumber)
        ?.message.match(/code is ([0-9]{6})/)?.[1];
      if (!code) throw new Error('Expected the mock inbox to contain an OTP.');
      return code;
    };
    const verifyCode = (challengeId: string, otpCode: string) =>
      fetch(`${baseUrl}/v1/auth/resident-sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, otpCode }),
      });

    const cooldownPhone = '+12025550200';
    expect((await createChallenge(cooldownPhone)).response.status).toBe(201);
    expect((await createChallenge(cooldownPhone)).response.status).toBe(429);

    const expiredPhone = '+12025550201';
    const expired = await createChallenge(expiredPhone);
    await pool.query(
      `UPDATE otp_challenges SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [expired.body.challengeId],
    );
    expect(
      (await verifyCode(expired.body.challengeId, findCode(expiredPhone))).status,
    ).toBe(401);

    const exhaustedPhone = '+12025550202';
    const exhausted = await createChallenge(exhaustedPhone);
    const exhaustedCode = findCode(exhaustedPhone);
    const wrongCode = exhaustedCode === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await verifyCode(exhausted.body.challengeId, wrongCode)).status).toBe(
        401,
      );
    }
    expect(
      (await verifyCode(exhausted.body.challengeId, exhaustedCode)).status,
    ).toBe(401);
    const challengeState = await pool.query<{
      attempt_count: number;
      challenge_status: string;
    }>(
      `SELECT attempt_count, challenge_status FROM otp_challenges WHERE id = $1`,
      [exhausted.body.challengeId],
    );
    expect(challengeState.rows[0]).toEqual({
      attempt_count: 5,
      challenge_status: 'invalidated',
    });

    await pool.query(
      `UPDATE sms_provider_configurations SET is_active = false WHERE id = $1`,
      [smsConfigurationId],
    );
    try {
      const unavailable = await createChallenge('+12025550203');
      expect(unavailable.response.status).toBe(503);
      expect((unavailable.body as unknown as ErrorBody).error.code).toBe(
        'SMS_DELIVERY_UNAVAILABLE',
      );
    } finally {
      await pool.query(
        `UPDATE sms_provider_configurations SET is_active = true WHERE id = $1`,
        [smsConfigurationId],
      );
    }
  });

  it('requires Super Admin MFA and protects cookie refresh with Origin and CSRF', async () => {
    const challengeResponse = await fetch(`${baseUrl}/v1/auth/super-admin-challenges`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    expect(challengeResponse.status).toBe(201);
    const challenge = (await challengeResponse.json()) as { challengeId: string };
    const verificationCode = await generate({ secret: totpSecret });
    const sessionResponse = await fetch(`${baseUrl}/v1/auth/super-admin-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        verificationCode,
      }),
    });
    expect(sessionResponse.status).toBe(201);
    const setCookie = sessionResponse.headers.get('set-cookie');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const adminSession = (await sessionResponse.json()) as {
      accessToken: string;
      csrfToken: string;
    };
    adminAccessToken = adminSession.accessToken;

    const replayChallengeResponse = await fetch(
      `${baseUrl}/v1/auth/super-admin-challenges`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      },
    );
    const replayChallenge = (await replayChallengeResponse.json()) as {
      challengeId: string;
    };
    const replayedTotp = await fetch(`${baseUrl}/v1/auth/super-admin-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: replayChallenge.challengeId,
        verificationCode,
      }),
    });
    expect(replayedTotp.status).toBe(401);

    const implementations = await fetch(
      `${baseUrl}/v1/sms-provider-implementations`,
      { headers: { authorization: `Bearer ${adminSession.accessToken}` } },
    );
    expect(implementations.status).toBe(200);
    expect(await implementations.json()).toEqual([
      expect.objectContaining({ providerKey: 'mock', available: true }),
    ]);

    const wrongOrigin = await fetch(
      `${baseUrl}/v1/auth/super-admin-session-refreshes`,
      {
        method: 'POST',
        headers: {
          cookie: setCookie?.split(';')[0] ?? '',
          origin: 'https://attacker.example',
          'x-csrf-token': adminSession.csrfToken,
        },
      },
    );
    expect(wrongOrigin.status).toBe(403);

    const wrongCsrf = await fetch(
      `${baseUrl}/v1/auth/super-admin-session-refreshes`,
      {
        method: 'POST',
        headers: {
          cookie: setCookie?.split(';')[0] ?? '',
          origin: 'http://localhost:3001',
          'x-csrf-token': '0'.repeat(64),
        },
      },
    );
    expect(wrongCsrf.status).toBe(401);

    const refreshResponse = await fetch(
      `${baseUrl}/v1/auth/super-admin-session-refreshes`,
      {
        method: 'POST',
        headers: {
          cookie: setCookie?.split(';')[0] ?? '',
          origin: 'http://localhost:3001',
          'x-csrf-token': adminSession.csrfToken,
        },
      },
    );
    expect(refreshResponse.status).toBe(201);
    expect(refreshResponse.headers.get('set-cookie')).not.toBe(setCookie);
  });

  it.each(['city_admin_web', 'gate_worker_mobile'] as const)(
    'denies a %s token even when its user has the Super Admin role',
    async (clientType) => {
      const userId = randomUUID();
      const sessionId = randomUUID();
      await pool.query(`INSERT INTO users (id, email) VALUES ($1, $2)`, [
        userId,
        `denied-actor-${userId}@example.com`,
      ]);
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = 'super_admin'`,
        [userId],
      );
      await pool.query(
        `INSERT INTO authentication_sessions
          (id, user_id, client_type, expires_at)
         VALUES ($1, $2, $3, now() + interval '1 day')`,
        [sessionId, userId, clientType],
      );
      const access = await jwtTokens.issueAccessToken({
        userId,
        sessionId,
        clientType,
      });

      const response = await fetch(`${baseUrl}/v1/sms-provider-configurations`, {
        headers: { authorization: `Bearer ${access.token}` },
      });
      expect(response.status).toBe(403);
      expect(((await response.json()) as ErrorBody).error.code).toBe(
        'PERMISSION_DENIED',
      );
    },
  );

  it('does not register the development inbox outside development', async () => {
    const response = await fetch(`${baseUrl}/v1/development/sms-inbox`, {
      headers: { 'x-dev-sms-inbox-token': 'test-development-inbox-token-0001' },
    });
    expect(response.status).toBe(404);
  });

  it('tests a configuration with fixed content without exposing credentials', async () => {
    const authorization = `Bearer ${adminAccessToken}`;

    const testResponse = await fetch(
      `${baseUrl}/v1/sms-provider-configurations/${smsConfigurationId}/tests`,
      {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify({ destination: '+12025550199' }),
      },
    );
    expect(testResponse.status).toBe(201);
    expect(await testResponse.json()).toEqual({ successful: true });

    const configurationResponse = await fetch(
      `${baseUrl}/v1/sms-provider-configurations/${smsConfigurationId}`,
      { headers: { authorization } },
    );
    const rawBody = await configurationResponse.text();
    expect(configurationResponse.status).toBe(200);
    expect(rawBody).not.toContain('ciphertext');
    expect(rawBody).not.toContain('encryptedCredentials');
    expect(JSON.parse(rawBody)).toMatchObject({ credentialsConfigured: {} });
  });
});
