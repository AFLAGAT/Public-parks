// Database schema definitions for Drizzle ORM.
//
// This file is intentionally empty for now — domain tables are created in
// later Phase 2 / Phase 3 checklist items. The first migration
// (enable PostGIS) is a raw SQL migration that does not require a schema
// definition. Once domain tables are added, they are defined here and
// exported, and Drizzle Kit generates migrations from diffs.
//
// Example (Phase 3):
//   import { pgTable, uuid, text } from 'drizzle-orm/pg-core';
//   export const facilities = pgTable('facilities', {
//     id: uuid('id').primaryKey(),
//     name: text('name').notNull(),
//     // ...
//   });

 
export const schema: Record<string, never> = {};