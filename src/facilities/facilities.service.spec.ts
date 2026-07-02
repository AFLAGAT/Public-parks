import { describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { RequestValidationException } from '../common/validation/request-validation.exception';
import type { FacilitiesRepository } from './facilities.repository';
import { FacilitiesService } from './facilities.service';
import type { FacilityDiscoveryRow } from './facilities.types';

const FIRST_FACILITY_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_FACILITY_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_FACILITY_ID = '33333333-3333-4333-8333-333333333333';

function createFacilityRow(
  id: string,
  name: string,
  distanceMeters: number | null = null,
): FacilityDiscoveryRow {
  return {
    id,
    name,
    description: `${name} description`,
    address: 'Addis Ababa',
    longitude: 38.7578,
    latitude: 9.0301,
    facilityTypeCode: 'public_park',
    facilityTypeName: 'Public Park',
    operationalClassification: 'entrance_based',
    distanceMeters,
  };
}

function createService(): {
  readonly service: FacilitiesService;
  readonly repository: Mocked<
    Pick<FacilitiesRepository, 'listFacilities' | 'getFacility'>
  >;
} {
  const repository: Mocked<
    Pick<FacilitiesRepository, 'listFacilities' | 'getFacility'>
  > = {
    listFacilities: vi.fn(),
    getFacility: vi.fn(),
  };
  return {
    service: new FacilitiesService(
      repository as unknown as FacilitiesRepository,
    ),
    repository,
  };
}

describe('FacilitiesService', () => {
  it('builds an alphabetical page and a filter-bound continuation cursor', async () => {
    const { service, repository } = createService();
    repository.listFacilities.mockResolvedValue([
      createFacilityRow(FIRST_FACILITY_ID, 'Alpha Park'),
      createFacilityRow(SECOND_FACILITY_ID, 'Beta Park'),
      createFacilityRow(THIRD_FACILITY_ID, 'Gamma Park'),
    ]);

    const firstPage = await service.listFacilities({
      pageSize: 2,
      facilityType: 'public_park',
    });

    expect(firstPage.data.map((facility) => facility.name)).toEqual([
      'Alpha Park',
      'Beta Park',
    ]);
    expect(firstPage.pagination.hasMore).toBe(true);
    expect(firstPage.pagination.nextCursor).not.toBeNull();

    repository.listFacilities.mockResolvedValue([]);
    await service.listFacilities({
      pageSize: 2,
      facilityType: 'public_park',
      cursor: firstPage.pagination.nextCursor ?? undefined,
    });

    const alphabeticalContinuation = repository.listFacilities.mock.calls.at(
      -1,
    )?.[0].decodedCursor;
    expect(alphabeticalContinuation).toMatchObject({
      mode: 'alphabetical',
      name: 'Beta Park',
      id: SECOND_FACILITY_ID,
    });
  });

  it('keeps exact distance in a nearby cursor while rounding public distance', async () => {
    const { service, repository } = createService();
    repository.listFacilities.mockResolvedValue([
      createFacilityRow(FIRST_FACILITY_ID, 'Nearby Park', 12.75),
      createFacilityRow(SECOND_FACILITY_ID, 'Next Park', 30.25),
    ]);

    const firstPage = await service.listFacilities({
      pageSize: 1,
      nearLat: 9.0301,
      nearLng: 38.7578,
      radiusMeters: 3000,
    });

    expect(firstPage.data[0]?.distanceMeters).toBe(13);
    repository.listFacilities.mockResolvedValue([]);
    await service.listFacilities({
      pageSize: 1,
      nearLat: 9.0301,
      nearLng: 38.7578,
      radiusMeters: 3000,
      cursor: firstPage.pagination.nextCursor ?? undefined,
    });
    const nearbyContinuation = repository.listFacilities.mock.calls.at(-1)?.[0]
      .decodedCursor;
    expect(nearbyContinuation).toMatchObject({
      mode: 'nearby',
      distanceMeters: 12.75,
    });
  });

  it('rejects a cursor replayed with different filters', async () => {
    const { service, repository } = createService();
    repository.listFacilities.mockResolvedValue([
      createFacilityRow(FIRST_FACILITY_ID, 'Alpha Park'),
      createFacilityRow(SECOND_FACILITY_ID, 'Beta Park'),
    ]);
    const firstPage = await service.listFacilities({
      pageSize: 1,
      search: 'park',
    });

    await expect(
      service.listFacilities({
        pageSize: 1,
        search: 'pool',
        cursor: firstPage.pagination.nextCursor ?? undefined,
      }),
    ).rejects.toBeInstanceOf(RequestValidationException);
    expect(repository.listFacilities).toHaveBeenCalledTimes(1);
  });

  it('maps an unavailable public facility to RESOURCE_NOT_FOUND', async () => {
    const { service, repository } = createService();
    repository.getFacility.mockResolvedValue(null);

    await expect(service.getFacility(FIRST_FACILITY_ID)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      httpStatus: 404,
    });
  });
});
