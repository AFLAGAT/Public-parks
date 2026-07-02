import { MAX_PAGE_SIZE } from './pagination.constants';
import { encodePaginationCursor } from './pagination-cursor.util';
import type { CursorPayload, PaginatedResponse } from './pagination.types';

/**
 * Builds a page from a repository result fetched with `LIMIT pageSize + 1`.
 * The extra row is used only to determine `hasMore` and is never returned.
 */
export function createPaginatedResponse<T>(
  fetchedItems: readonly T[],
  pageSize: number,
  getCursorPayload: (item: T) => CursorPayload,
): PaginatedResponse<T> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError(`pageSize must be an integer between 1 and ${String(MAX_PAGE_SIZE)}.`);
  }

  const data = fetchedItems.slice(0, pageSize);
  const hasMore = fetchedItems.length > pageSize;
  const lastItem = data.at(-1);
  const nextCursor = hasMore && lastItem !== undefined
    ? encodePaginationCursor(getCursorPayload(lastItem))
    : null;

  return {
    data,
    pagination: { nextCursor, hasMore },
  };
}
