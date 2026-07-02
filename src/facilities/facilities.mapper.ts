import type {
  FacilityDiscoveryRow,
  FacilityResponse,
} from './facilities.types';

/** Maps the database query shape to the stable public facility contract. */
export function mapFacilityRowToResponse(
  row: FacilityDiscoveryRow,
): FacilityResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
    },
    facilityType: {
      code: row.facilityTypeCode,
      name: row.facilityTypeName,
      operationalClassification: row.operationalClassification,
    },
    distanceMeters:
      row.distanceMeters === null ? null : Math.round(row.distanceMeters),
  };
}
