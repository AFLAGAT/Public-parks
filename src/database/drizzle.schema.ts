import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
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

export const schema = { facilities, facilityTypes, users };
