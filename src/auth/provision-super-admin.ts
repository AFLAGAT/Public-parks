import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { hash, argon2id } from 'argon2';
import { generateSecret, generateURI } from 'otplib';
import { randomBytes, randomUUID } from 'crypto';
import { createInterface } from 'readline/promises';
import { emitKeypressEvents } from 'readline';
import { stdin as input, stdout as output } from 'process';
import { Pool } from 'pg';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule, DRIZZLE_POOL } from '../database/drizzle.module';
import { SecurityModule } from '../common/security/security.module';
import { FieldEncryptionService } from '../common/security/field-encryption.service';
import { SecretHashService } from '../common/security/secret-hash.service';

@Module({ imports: [ConfigModule, DatabaseModule, SecurityModule] })
class ProvisionSuperAdminModule {}

async function readSecret(label: string): Promise<string> {
  output.write(label);
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  return new Promise<string>((resolvePromise, rejectPromise) => {
    let value = '';
    const cleanup = (): void => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(false);
      output.write('\n');
    };
    const onKeypress = (
      character: string,
      key: { readonly name?: string; readonly ctrl?: boolean },
    ): void => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        rejectPromise(new Error('Provisioning cancelled.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolvePromise(value);
      } else if (key.name === 'backspace') {
        value = value.slice(0, -1);
      } else if (!key.ctrl && character.length === 1) {
        value += character;
      }
    };
    input.on('keypress', onKeypress);
  });
}

async function main(): Promise<void> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Super Admin provisioning must be run from an interactive terminal.');
  }
  const prompt = createInterface({ input, output });
  const email = (await prompt.question('Super Admin email: ')).trim().toLowerCase();
  prompt.close();
  const password = await readSecret('Temporary password (12+ characters): ');
  const confirmationPrompt = createInterface({ input, output });
  const confirmation = await confirmationPrompt.question('Type PROVISION to continue: ');
  confirmationPrompt.close();
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || confirmation !== 'PROVISION') {
    throw new Error('Provisioning cancelled or input was invalid.');
  }

  const app = await NestFactory.createApplicationContext(ProvisionSuperAdminModule, {
    logger: false,
  });
  try {
    const pool = app.get<Pool>(DRIZZLE_POOL);
    const encryption = app.get(FieldEncryptionService);
    const secretHash = app.get(SecretHashService);
    const userId = randomUUID();
    const factorId = randomUUID();
    const totpSecret = generateSecret();
    const recoveryCodes = Array.from({ length: 10 }, () =>
      randomBytes(9).toString('base64url').toUpperCase(),
    );
    const passwordHash = await hash(password, { type: argon2id });
    const encryptedSecret = encryption.encryptJson(totpSecret, `totp-factor:${factorId}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, email, email_verified_at) VALUES ($1, $2, now())`,
        [userId, email],
      );
      await client.query(
        `INSERT INTO password_credentials (user_id, password_hash) VALUES ($1, $2)`,
        [userId, passwordHash],
      );
      const roleAssignment = await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE code = 'super_admin'
         RETURNING id`,
        [userId],
      );
      if (roleAssignment.rowCount !== 1) {
        throw new Error('The super_admin role has not been seeded. Run migrations first.');
      }
      await client.query(
        `INSERT INTO totp_factors (id, user_id, encrypted_secret) VALUES ($1, $2, $3)`,
        [factorId, userId, encryptedSecret],
      );
      for (const recoveryCode of recoveryCodes) {
        await client.query(
          `INSERT INTO totp_recovery_codes (totp_factor_id, code_hash) VALUES ($1, $2)`,
          [factorId, secretHash.hashToken(`recovery:${recoveryCode}`)],
        );
      }
      await client.query(
        `INSERT INTO audit_logs
          (actor_type, actor_id, action, target_type, target_id, metadata)
         VALUES ('system', NULL, 'super_admin.provisioned', 'user', $1, $2)`,
        [userId, { roleCode: 'super_admin' }],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    output.write('\nProvisioned successfully. Store these values securely; they are shown once.\n');
    output.write(`TOTP URI: ${generateURI({ issuer: 'Public Parks', label: email, secret: totpSecret })}\n`);
    output.write(`Recovery codes:\n${recoveryCodes.join('\n')}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Provisioning failed.';
  console.error(message);
  process.exitCode = 1;
});
