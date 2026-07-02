import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_CURSOR_LENGTH,
  MAX_PAGE_SIZE,
} from './pagination.constants';

export const paginationCursorSchema = z
  .string()
  .min(1)
  .max(MAX_CURSOR_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/, 'Cursor must use canonical Base64URL characters.');

export const paginationQuerySchema = z
  .object({
    cursor: paginationCursorSchema.optional(),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();
