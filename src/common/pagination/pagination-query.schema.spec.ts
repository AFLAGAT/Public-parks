import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination.constants';
import { paginationQuerySchema } from './pagination-query.schema';

describe('paginationQuerySchema', () => {
  it('applies the bounded default page size', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ pageSize: DEFAULT_PAGE_SIZE });
  });

  it('coerces a valid query-string page size', () => {
    expect(paginationQuerySchema.parse({ pageSize: '50' })).toEqual({ pageSize: 50 });
  });

  it.each(['0', '-1', '1.5', 'not-a-number', String(MAX_PAGE_SIZE + 1)])(
    'rejects invalid pageSize %s',
    (pageSize) => {
      expect(paginationQuerySchema.safeParse({ pageSize }).success).toBe(false);
    },
  );

  it('rejects unknown pagination fields', () => {
    expect(paginationQuerySchema.safeParse({ page: '1', limit: '25' }).success).toBe(false);
  });
});
