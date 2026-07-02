import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodePaginationCursor } from './pagination-cursor.util';
import { createPaginatedResponse } from './paginated-response.util';

const itemCursorSchema = z.object({ id: z.string() }).strict();

describe('createPaginatedResponse', () => {
  it('returns pageSize items and derives the next cursor from the last returned item', () => {
    const fetchedItems = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    const response = createPaginatedResponse(fetchedItems, 2, (item) => ({ id: item.id }));

    expect(response.data).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(response.pagination.hasMore).toBe(true);
    expect(response.pagination.nextCursor).not.toBeNull();
    expect(decodePaginationCursor(response.pagination.nextCursor!, itemCursorSchema)).toEqual({
      id: 'b',
    });
    expect(fetchedItems).toHaveLength(3);
  });

  it('returns a null cursor when no extra row exists', () => {
    expect(
      createPaginatedResponse([{ id: 'a' }, { id: 'b' }], 2, (item) => ({ id: item.id })),
    ).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      pagination: { nextCursor: null, hasMore: false },
    });
  });

  it('returns an empty stable envelope for an empty page', () => {
    expect(createPaginatedResponse([], 25, () => ({ id: 'unreachable' }))).toEqual({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });
  });

  it.each([0, -1, 1.5, 101])('rejects programmer-supplied pageSize %s', (pageSize) => {
    expect(() => createPaginatedResponse([], pageSize, () => ({ id: 'x' }))).toThrow(RangeError);
  });
});
