import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Client-neutral identity shared by resident, staff, and admin experiences.
 * Roles, client types, credentials, OTPs, and reset tokens intentionally do
 * not live on this foundational record.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().notNull(),
    phoneNumber: varchar('phone_number', { length: 16 }),
    email: varchar('email', { length: 254 }),
    phoneNumberVerifiedAt: timestamp('phone_number_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    emailVerifiedAt: timestamp('email_verified_at', {
      withTimezone: true,
      mode: 'date',
    }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_users', columns: [table.id] }),
    uniqueIndex('uidx_users__phone_number').on(table.phoneNumber),
    uniqueIndex('uidx_users__email').on(table.email),
    check(
      'chk_users__identity_channel_present',
      sql`${table.phoneNumber} is not null or ${table.email} is not null`,
    ),
    check(
      'chk_users__phone_number_e164',
      sql`${table.phoneNumber} is null or ${table.phoneNumber} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
    check(
      'chk_users__email_normalized',
      sql`${table.email} is null or (${table.email} = lower(btrim(${table.email})) and char_length(${table.email}) between 3 and 254 and position('@' in ${table.email}) > 1)`,
    ),
    check(
      'chk_users__phone_verification_has_phone_number',
      sql`${table.phoneNumberVerifiedAt} is null or ${table.phoneNumber} is not null`,
    ),
    check(
      'chk_users__email_verification_has_email',
      sql`${table.emailVerifiedAt} is null or ${table.email} is not null`,
    ),
  ],
);

export const schema = { users };
