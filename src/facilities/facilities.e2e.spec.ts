import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule } from '../auth/auth.module';
import { ErrorCode } from '../common/errors/error-codes';
import { ErrorsModule } from '../common/errors/errors.module';
import { LoggingModule } from '../common/logging/logging.module';
import { ValidationModule } from '../common/validation/validation.module';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesRepository } from './facilities.repository';
import { FacilitiesService } from './facilities.service';
import {
  GetFacilityParamsDto,
  ListFacilitiesQueryDto,
  type FacilityDiscoveryRow,
} from './facilities.types';

const FACILITY_ID = '11111111-1111-4111-8111-111111111111';

const facilityRow: FacilityDiscoveryRow = {
  id: FACILITY_ID,
  name: 'Meskel Square Park',
  description: 'A central public park.',
  address: 'Kirkos, Addis Ababa',
  longitude: 38.7635,
  latitude: 9.0105,
  facilityTypeCode: 'public_park',
  facilityTypeName: 'Public Park',
  operationalClassification: 'entrance_based',
  distanceMeters: null,
};

// Vitest transforms TypeScript with esbuild, which does not emit decorator
// metadata. Define the route metatypes explicitly to match the production build.
Reflect.defineMetadata(
  'design:paramtypes',
  [ListFacilitiesQueryDto],
  FacilitiesController.prototype,
  'listFacilities',
);
Reflect.defineMetadata(
  'design:paramtypes',
  [GetFacilityParamsDto],
  FacilitiesController.prototype,
  'getFacility',
);

describe('facility discovery HTTP contract (e2e)', () => {
  const repository = {
    listFacilities: vi.fn(),
    getFacility: vi.fn(),
  };
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggingModule, ErrorsModule, ValidationModule, AuthModule],
      controllers: [FacilitiesController],
      providers: [
        FacilitiesService,
        { provide: FacilitiesRepository, useValue: repository },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl())
      .replace('[::1]', '127.0.0.1')
      .replace('0.0.0.0', '127.0.0.1');
  });

  beforeEach(() => {
    repository.listFacilities.mockReset();
    repository.getFacility.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('serves a bounded facility page without authentication', async () => {
    repository.listFacilities.mockResolvedValue([facilityRow]);

    const response = await fetch(
      `${baseUrl}/v1/facilities?pageSize=1&facilityType=public_park`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          id: FACILITY_ID,
          name: 'Meskel Square Park',
          description: 'A central public park.',
          address: 'Kirkos, Addis Ababa',
          location: { latitude: 9.0105, longitude: 38.7635 },
          facilityType: {
            code: 'public_park',
            name: 'Public Park',
            operationalClassification: 'entrance_based',
          },
          distanceMeters: null,
        },
      ],
      pagination: { nextCursor: null, hasMore: false },
    });
  });

  it('rejects incomplete nearby input through the canonical envelope', async () => {
    const response = await fetch(
      `${baseUrl}/v1/facilities?nearLat=9.03&nearLng=38.74`,
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; details: Record<string, string[]> };
    };
    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.error.details.radiusMeters).toBeDefined();
    expect(repository.listFacilities).not.toHaveBeenCalled();
  });

  it('returns public detail and hides unavailable facilities as not found', async () => {
    repository.getFacility.mockResolvedValueOnce(facilityRow).mockResolvedValueOnce(null);

    const foundResponse = await fetch(
      `${baseUrl}/v1/facilities/${FACILITY_ID}`,
    );
    expect(foundResponse.status).toBe(200);
    expect((await foundResponse.json()) as { id: string }).toMatchObject({
      id: FACILITY_ID,
    });

    const missingResponse = await fetch(
      `${baseUrl}/v1/facilities/22222222-2222-4222-8222-222222222222`,
    );
    expect(missingResponse.status).toBe(404);
    const missingBody = (await missingResponse.json()) as {
      error: { code: string };
    };
    expect(missingBody.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
  });

  it('rejects malformed facility ids before repository access', async () => {
    const response = await fetch(`${baseUrl}/v1/facilities/not-a-uuid`);

    expect(response.status).toBe(400);
    expect(repository.getFacility).not.toHaveBeenCalled();
  });
});
