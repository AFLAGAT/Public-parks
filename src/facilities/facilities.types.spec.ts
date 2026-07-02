import { describe, expect, it } from 'vitest';
import {
  getFacilityParamsSchema,
  listFacilitiesQuerySchema,
} from './facilities.types';

describe('facility discovery request schemas', () => {
  it('normalizes bounded pagination and nearby query values', () => {
    expect(
      listFacilitiesQuerySchema.parse({
        pageSize: '10',
        search: '  pool  ',
        facilityType: 'public_pool',
        nearLat: '9.0301',
        nearLng: '38.7578',
        radiusMeters: '3000',
      }),
    ).toEqual({
      pageSize: 10,
      search: 'pool',
      facilityType: 'public_pool',
      nearLat: 9.0301,
      nearLng: 38.7578,
      radiusMeters: 3000,
    });
  });

  it('requires all geolocation fields together', () => {
    const result = listFacilitiesQuerySchema.safeParse({
      nearLat: '9.0301',
      nearLng: '38.7578',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.radiusMeters).toEqual([
        'nearLat, nearLng, and radiusMeters must be provided together.',
      ]);
    }
  });

  it('rejects unknown fields and malformed public identifiers', () => {
    expect(
      listFacilitiesQuerySchema.safeParse({ pageSize: 25, internal: true })
        .success,
    ).toBe(false);
    expect(
      getFacilityParamsSchema.safeParse({ facilityId: 'not-a-uuid' }).success,
    ).toBe(false);
  });
});
