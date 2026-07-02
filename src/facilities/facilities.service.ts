import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { createPaginatedResponse } from '../common/pagination/paginated-response.util';
import { decodePaginationCursor } from '../common/pagination/pagination-cursor.util';
import { RequestValidationException } from '../common/validation/request-validation.exception';
import { mapFacilityRowToResponse } from './facilities.mapper';
import { FacilitiesRepository } from './facilities.repository';
import type {
  FacilityDiscoveryCursor,
  FacilityDiscoveryRow,
  FacilityResponse,
  ListFacilitiesQuery,
  ListFacilitiesResponse,
} from './facilities.types';

const alphabeticalFacilityCursorSchema = z
  .object({
    mode: z.literal('alphabetical'),
    name: z.string(),
    id: z.string().uuid(),
    queryKey: z.string(),
  })
  .strict();

const nearbyFacilityCursorSchema = z
  .object({
    mode: z.literal('nearby'),
    distanceMeters: z.number().finite().nonnegative(),
    id: z.string().uuid(),
    queryKey: z.string(),
  })
  .strict();

const facilityDiscoveryCursorSchema = z.discriminatedUnion('mode', [
  alphabeticalFacilityCursorSchema,
  nearbyFacilityCursorSchema,
]);

const INCOMPATIBLE_CURSOR_MESSAGE =
  'Cursor is malformed or incompatible with this endpoint.';

@Injectable()
export class FacilitiesService {
  constructor(
    @Inject(FacilitiesRepository)
    private readonly facilitiesRepository: FacilitiesRepository,
  ) {}

  async listFacilities(
    query: ListFacilitiesQuery,
  ): Promise<ListFacilitiesResponse> {
    const queryKey = this.createQueryKey(query);
    const expectedMode = query.nearLat === undefined ? 'alphabetical' : 'nearby';
    const decodedCursor = this.decodeCursor(query.cursor);

    if (
      decodedCursor !== undefined &&
      (decodedCursor.mode !== expectedMode || decodedCursor.queryKey !== queryKey)
    ) {
      throw new RequestValidationException({
        cursor: [INCOMPATIBLE_CURSOR_MESSAGE],
      });
    }

    const rows = await this.facilitiesRepository.listFacilities({
      ...query,
      decodedCursor,
    });
    const page = createPaginatedResponse(
      rows,
      query.pageSize,
      (row) => this.createCursorPayload(row, queryKey),
    );

    return {
      data: page.data.map(mapFacilityRowToResponse),
      pagination: page.pagination,
    };
  }

  async getFacility(facilityId: string): Promise<FacilityResponse> {
    const row = await this.facilitiesRepository.getFacility(facilityId);
    if (row === null) {
      throw new ApplicationException(
        ErrorCode.RESOURCE_NOT_FOUND,
        'Facility was not found.',
      );
    }
    return mapFacilityRowToResponse(row);
  }

  private decodeCursor(
    cursor: string | undefined,
  ): FacilityDiscoveryCursor | undefined {
    return cursor === undefined
      ? undefined
      : decodePaginationCursor(cursor, facilityDiscoveryCursorSchema);
  }

  private createCursorPayload(
    row: FacilityDiscoveryRow,
    queryKey: string,
  ): FacilityDiscoveryCursor {
    return row.distanceMeters === null
      ? { mode: 'alphabetical', name: row.name, id: row.id, queryKey }
      : {
          mode: 'nearby',
          distanceMeters: row.distanceMeters,
          id: row.id,
          queryKey,
        };
  }

  private createQueryKey(query: ListFacilitiesQuery): string {
    return JSON.stringify({
      search: query.search ?? null,
      facilityType: query.facilityType ?? null,
      nearLat: query.nearLat ?? null,
      nearLng: query.nearLng ?? null,
      radiusMeters: query.radiusMeters ?? null,
    });
  }
}
