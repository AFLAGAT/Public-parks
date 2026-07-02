export type CursorScalar = string | number | boolean | null;
export type CursorPayload = Readonly<Record<string, CursorScalar>>;

export interface PaginationQuery {
  readonly cursor?: string;
  readonly pageSize: number;
}

export interface PaginationMetadata {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly pagination: PaginationMetadata;
}
