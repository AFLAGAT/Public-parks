import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  pgEnum,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { parseEWKB } from 'drizzle-orm/pg-core/columns/postgis_extension/utils';

const geometryPoint4326 = customType<{
  data: { x: number; y: number };
  driverData: string;
}>({
  dataType: () => 'geometry(Point,4326)',
  toDriver: (value) => `SRID=4326;POINT(${String(value.x)} ${String(value.y)})`,
  fromDriver: (value) => {
    const [x, y] = parseEWKB(value);
    return { x, y };
  },
});

export const facilityOperationalClassification = pgEnum(
  'facility_operational_classification',
  ['slot_based', 'entrance_based'],
);

export interface EncryptedFieldPayload {
  readonly keyId: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
}

export const authenticationClientType = pgEnum('authentication_client_type', [
  'resident_mobile',
  'super_admin_web',
  'city_admin_web',
  'gate_worker_mobile',
]);
export const authenticationSessionStatus = pgEnum(
  'authentication_session_status',
  ['active', 'revoked'],
);
export const refreshTokenStatus = pgEnum('refresh_token_status', [
  'active',
  'rotated',
  'revoked',
]);
export const otpChallengeStatus = pgEnum('otp_challenge_status', [
  'pending',
  'consumed',
  'invalidated',
  'delivery_failed',
]);
export const smsProviderScopeType = pgEnum('sms_provider_scope_type', [
  'platform',
  'city',
]);
export const smsDeliveryStatus = pgEnum('sms_delivery_status', [
  'sent',
  'failed',
]);
export const auditActorType = pgEnum('audit_actor_type', [
  'resident',
  'staff',
  'admin',
  'system',
]);
export const staffAssignmentStatus = pgEnum('staff_assignment_status', [
  'active',
  'revoked',
]);
export const qrScannableType = pgEnum('qr_scannable_type', [
  'slot_reservation',
  'entrance_ticket',
]);
export const qrCodeStatus = pgEnum('qr_code_status', ['active', 'revoked']);

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

export const facilityTypes = pgTable(
  'facility_types',
  {
    id: uuid('id').defaultRandom().notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    operationalClassification: facilityOperationalClassification(
      'operational_classification',
    ).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_facility_types', columns: [table.id] }),
    uniqueIndex('uidx_facility_types__code').on(table.code),
    check(
      'chk_facility_types__code_normalized',
      sql`${table.code} ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'`,
    ),
    check(
      'chk_facility_types__name_normalized',
      sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) > 0`,
    ),
  ],
);

export const facilities = pgTable(
  'facilities',
  {
    id: uuid('id').defaultRandom().notNull(),
    facilityTypeId: uuid('facility_type_id').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    address: varchar('address', { length: 300 }).notNull(),
    location: geometryPoint4326('location').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_facilities', columns: [table.id] }),
    foreignKey({
      name: 'fk_facilities__facility_type_id__facility_types',
      columns: [table.facilityTypeId],
      foreignColumns: [facilityTypes.id],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    index('idx_facilities__facility_type_id').on(table.facilityTypeId),
    index('idx_facilities__location_geography').using(
      'gist',
      sql`(${table.location}::geography)`,
    ),
    check(
      'chk_facilities__name_normalized',
      sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) > 0`,
    ),
    check(
      'chk_facilities__address_normalized',
      sql`${table.address} = btrim(${table.address}) and char_length(${table.address}) > 0`,
    ),
    check(
      'chk_facilities__location_bounds',
      sql`ST_X(${table.location}) between -180 and 180 and ST_Y(${table.location}) between -90 and 90`,
    ),
    check('chk_facilities__location_srid', sql`ST_SRID(${table.location}) = 4326`),
  ],
);

/**
 * Server-side source of truth for which staff member may act at which facility,
 * bounded by an explicit time range. Scope enforcement (schedule views, QR
 * validation, offline sync) reads the active, in-window assignment from here;
 * revocation must immediately deny future access. Accountability fields record
 * which admin created and later revoked each assignment.
 */
export const staffAssignments = pgTable(
  'staff_assignments',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    facilityId: uuid('facility_id').notNull(),
    assignedByUserId: uuid('assigned_by_user_id').notNull(),
    assignmentStatus: staffAssignmentStatus('assignment_status')
      .default('active')
      .notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedByUserId: uuid('revoked_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_staff_assignments', columns: [table.id] }),
    foreignKey({
      name: 'fk_staff_assignments__user_id__users',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_staff_assignments__facility_id__facilities',
      columns: [table.facilityId],
      foreignColumns: [facilities.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_staff_assignments__assigned_by_user_id__users',
      columns: [table.assignedByUserId],
      foreignColumns: [users.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_staff_assignments__revoked_by_user_id__users',
      columns: [table.revokedByUserId],
      foreignColumns: [users.id],
    }).onDelete('restrict'),
    uniqueIndex('uidx_staff_assignments__user_facility__where_active')
      .on(table.userId, table.facilityId)
      .where(sql`${table.assignmentStatus} = 'active'`),
    index('idx_staff_assignments__facility_id_assignment_status').on(
      table.facilityId,
      table.assignmentStatus,
    ),
    index('idx_staff_assignments__user_id_assignment_status').on(
      table.userId,
      table.assignmentStatus,
    ),
    check(
      'chk_staff_assignments__time_range',
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      'chk_staff_assignments__revocation_consistency',
      sql`(${table.assignmentStatus} = 'active' and ${table.revokedAt} is null and ${table.revokedByUserId} is null) or (${table.assignmentStatus} = 'revoked' and ${table.revokedAt} is not null and ${table.revokedByUserId} is not null)`,
    ),
  ],
);

/**
 * Polymorphic access credential. One QR pattern references either a slot
 * reservation or an entrance ticket through the approved `scannable_type` /
 * `scannable_id` pair (an enum type, so the credential can never point at a
 * non-scannable entity). Per the confirmed QR token design, the signed token
 * carries only this row's `id`; no reusable secret is stored. Single-use and
 * quantity-aware consumption are recorded in `check_ins` (the idempotency-keyed
 * scan ledger), not as a boolean here, so this row tracks only issuance and
 * revocation. `created_at` is the issuance time; revoking denies future scans.
 * At most one active credential may exist per booking.
 */
export const qrCodes = pgTable(
  'qr_codes',
  {
    id: uuid('id').defaultRandom().notNull(),
    scannableType: qrScannableType('scannable_type').notNull(),
    scannableId: uuid('scannable_id').notNull(),
    qrCodeStatus: qrCodeStatus('qr_code_status').default('active').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_qr_codes', columns: [table.id] }),
    uniqueIndex('uidx_qr_codes__scannable__where_active')
      .on(table.scannableType, table.scannableId)
      .where(sql`${table.qrCodeStatus} = 'active'`),
    check(
      'chk_qr_codes__revocation_consistency',
      sql`(${table.qrCodeStatus} = 'active' and ${table.revokedAt} is null) or (${table.qrCodeStatus} = 'revoked' and ${table.revokedAt} is not null)`,
    ),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().notNull(),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_roles', columns: [table.id] }),
    uniqueIndex('uidx_roles__code').on(table.code),
    check('chk_roles__code_normalized', sql`${table.code} ~ '^[a-z][a-z0-9_]*$'`),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().notNull(),
    code: varchar('code', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_permissions', columns: [table.id] }),
    uniqueIndex('uidx_permissions__code').on(table.code),
    check(
      'chk_permissions__code_normalized',
      sql`${table.code} ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$'`,
    ),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').defaultRandom().notNull(),
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_role_permissions', columns: [table.id] }),
    foreignKey({
      name: 'fk_role_permissions__role_id__roles',
      columns: [table.roleId],
      foreignColumns: [roles.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_role_permissions__permission_id__permissions',
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
    }).onDelete('cascade'),
    uniqueIndex('uidx_role_permissions__role_id_permission_id').on(
      table.roleId,
      table.permissionId,
    ),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_user_roles', columns: [table.id] }),
    foreignKey({
      name: 'fk_user_roles__user_id__users',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_user_roles__role_id__roles',
      columns: [table.roleId],
      foreignColumns: [roles.id],
    }).onDelete('restrict'),
    uniqueIndex('uidx_user_roles__user_id_role_id').on(table.userId, table.roleId),
  ],
);

export const passwordCredentials = pgTable(
  'password_credentials',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_password_credentials', columns: [table.id] }),
    foreignKey({
      name: 'fk_password_credentials__user_id__users',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    uniqueIndex('uidx_password_credentials__user_id').on(table.userId),
  ],
);

export const totpFactors = pgTable(
  'totp_factors',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    encryptedSecret: jsonb('encrypted_secret').$type<EncryptedFieldPayload>().notNull(),
    lastAcceptedTimeStep: integer('last_accepted_time_step'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_totp_factors', columns: [table.id] }),
    foreignKey({
      name: 'fk_totp_factors__user_id__users',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    uniqueIndex('uidx_totp_factors__user_id').on(table.userId),
  ],
);

export const totpRecoveryCodes = pgTable(
  'totp_recovery_codes',
  {
    id: uuid('id').defaultRandom().notNull(),
    totpFactorId: uuid('totp_factor_id').notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_totp_recovery_codes', columns: [table.id] }),
    foreignKey({
      name: 'fk_totp_recovery_codes__totp_factor_id__totp_factors',
      columns: [table.totpFactorId],
      foreignColumns: [totpFactors.id],
    }).onDelete('cascade'),
    uniqueIndex('uidx_totp_recovery_codes__totp_factor_id_code_hash').on(
      table.totpFactorId,
      table.codeHash,
    ),
  ],
);

export const authenticationSessions = pgTable(
  'authentication_sessions',
  {
    id: uuid('id').defaultRandom().notNull(),
    userId: uuid('user_id').notNull(),
    clientType: authenticationClientType('client_type').notNull(),
    sessionStatus: authenticationSessionStatus('session_status')
      .default('active')
      .notNull(),
    deviceName: varchar('device_name', { length: 120 }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_authentication_sessions', columns: [table.id] }),
    foreignKey({
      name: 'fk_authentication_sessions__user_id__users',
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('cascade'),
    index('idx_authentication_sessions__user_id_session_status').on(
      table.userId,
      table.sessionStatus,
    ),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().notNull(),
    authenticationSessionId: uuid('authentication_session_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    refreshTokenStatus: refreshTokenStatus('refresh_token_status')
      .default('active')
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_refresh_tokens', columns: [table.id] }),
    foreignKey({
      name: 'fk_refresh_tokens__authentication_session_id__authentication_sessions',
      columns: [table.authenticationSessionId],
      foreignColumns: [authenticationSessions.id],
    }).onDelete('cascade'),
    uniqueIndex('uidx_refresh_tokens__token_hash').on(table.tokenHash),
    index('idx_refresh_tokens__authentication_session_id_status').on(
      table.authenticationSessionId,
      table.refreshTokenStatus,
    ),
  ],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').defaultRandom().notNull(),
    phoneNumber: varchar('phone_number', { length: 16 }).notNull(),
    codeDigest: varchar('code_digest', { length: 64 }).notNull(),
    challengeStatus: otpChallengeStatus('challenge_status').default('pending').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_otp_challenges', columns: [table.id] }),
    index('idx_otp_challenges__phone_number_status_created_at').on(
      table.phoneNumber,
      table.challengeStatus,
      table.createdAt,
    ),
    check('chk_otp_challenges__attempt_count_range', sql`${table.attemptCount} between 0 and 5`),
  ],
);

export const smsProviderConfigurations = pgTable(
  'sms_provider_configurations',
  {
    id: uuid('id').defaultRandom().notNull(),
    scopeType: smsProviderScopeType('scope_type').default('platform').notNull(),
    scopeId: uuid('scope_id'),
    providerKey: varchar('provider_key', { length: 80 }).notNull(),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    apiUrl: text('api_url'),
    encryptedCredentials: jsonb('encrypted_credentials')
      .$type<EncryptedFieldPayload>()
      .notNull(),
    senderId: varchar('sender_id', { length: 40 }),
    timeoutMs: integer('timeout_ms').default(10_000).notNull(),
    retryCount: integer('retry_count').default(1).notNull(),
    isEnabled: boolean('is_enabled').default(false).notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    revision: integer('revision').default(1).notNull(),
    lastSuccessfulTestRevision: integer('last_successful_test_revision'),
    activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'date' }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').notNull(),
    updatedByUserId: uuid('updated_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_sms_provider_configurations', columns: [table.id] }),
    foreignKey({
      name: 'fk_sms_provider_configurations__created_by_user_id__users',
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_sms_provider_configurations__updated_by_user_id__users',
      columns: [table.updatedByUserId],
      foreignColumns: [users.id],
    }).onDelete('restrict'),
    uniqueIndex('uidx_sms_provider_configurations__scope_provider_revision').on(
      table.scopeType,
      sql`coalesce(${table.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.providerKey,
      table.revision,
    ),
    uniqueIndex('uidx_sms_provider_configurations__active_scope')
      .on(
        table.scopeType,
        sql`coalesce(${table.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.isActive} = true`),
    check(
      'chk_sms_provider_configurations__scope_shape',
      sql`(${table.scopeType} = 'platform' and ${table.scopeId} is null) or (${table.scopeType} = 'city' and ${table.scopeId} is not null)`,
    ),
    check('chk_sms_provider_configurations__timeout_range', sql`${table.timeoutMs} between 1000 and 30000`),
    check('chk_sms_provider_configurations__retry_range', sql`${table.retryCount} between 0 and 3`),
    check('chk_sms_provider_configurations__revision_positive', sql`${table.revision} > 0`),
  ],
);

export const smsProviderTests = pgTable(
  'sms_provider_tests',
  {
    id: uuid('id').defaultRandom().notNull(),
    smsProviderConfigurationId: uuid('sms_provider_configuration_id').notNull(),
    configurationRevision: integer('configuration_revision').notNull(),
    destinationHash: varchar('destination_hash', { length: 64 }).notNull(),
    destinationMasked: varchar('destination_masked', { length: 24 }).notNull(),
    isSuccessful: boolean('is_successful').notNull(),
    errorCode: varchar('error_code', { length: 80 }),
    durationMs: integer('duration_ms').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_sms_provider_tests', columns: [table.id] }),
    foreignKey({
      name: 'fk_sms_provider_tests__sms_provider_configuration_id__sms_provider_configurations',
      columns: [table.smsProviderConfigurationId],
      foreignColumns: [smsProviderConfigurations.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_sms_provider_tests__actor_user_id__users',
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete('restrict'),
  ],
);

export const smsDeliveryAttempts = pgTable(
  'sms_delivery_attempts',
  {
    id: uuid('id').defaultRandom().notNull(),
    smsProviderConfigurationId: uuid('sms_provider_configuration_id').notNull(),
    providerKey: varchar('provider_key', { length: 80 }).notNull(),
    purpose: varchar('purpose', { length: 40 }).notNull(),
    destinationHash: varchar('destination_hash', { length: 64 }).notNull(),
    deliveryStatus: smsDeliveryStatus('delivery_status').notNull(),
    providerMessageId: varchar('provider_message_id', { length: 160 }),
    errorCode: varchar('error_code', { length: 80 }),
    attemptNumber: integer('attempt_number').notNull(),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_sms_delivery_attempts', columns: [table.id] }),
    foreignKey({
      name: 'fk_sms_delivery_attempts__sms_provider_configuration_id__sms_provider_configurations',
      columns: [table.smsProviderConfigurationId],
      foreignColumns: [smsProviderConfigurations.id],
    }).onDelete('restrict'),
    index('idx_sms_delivery_attempts__configuration_created_at').on(
      table.smsProviderConfigurationId,
      table.createdAt,
    ),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().notNull(),
    actorType: auditActorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: varchar('action', { length: 120 }).notNull(),
    targetType: varchar('target_type', { length: 80 }).notNull(),
    targetId: uuid('target_id'),
    correlationId: uuid('correlation_id'),
    requestIpHash: varchar('request_ip_hash', { length: 64 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_audit_logs', columns: [table.id, table.createdAt] }),
    index('idx_audit_logs__actor_id_created_at').on(table.actorId, table.createdAt),
    index('idx_audit_logs__target_type_target_id_created_at').on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
  ],
);

export const schema = {
  auditLogs,
  authenticationSessions,
  facilities,
  facilityTypes,
  otpChallenges,
  passwordCredentials,
  permissions,
  qrCodes,
  refreshTokens,
  rolePermissions,
  roles,
  smsDeliveryAttempts,
  smsProviderConfigurations,
  smsProviderTests,
  staffAssignments,
  totpFactors,
  totpRecoveryCodes,
  userRoles,
  users,
};
