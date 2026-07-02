import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination/pagination-query.schema';
import type { PaginatedResponse } from '../common/pagination/pagination.types';
import { createZodDto } from '../common/validation/create-zod-dto.util';

export const facilityOperationalClassificationSchema = z.enum([
  'slot_based',
  'entrance_based',
]);

const facilityTypeCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);

export const listFacilitiesQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().min(1).max(100).optional(),
    facilityType: facilityTypeCodeSchema.optional(),
    nearLat: z.coerce.number().finite().min(-90).max(90).optional(),
    nearLng: z.coerce.number().finite().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().int().min(1).max(50_000).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    const locationFields = [query.nearLat, query.nearLng, query.radiusMeters];
    const providedLocationFieldCount = locationFields.filter(
      (value) => value !== undefined,
    ).length;

    if (providedLocationFieldCount !== 0 && providedLocationFieldCount !== 3) {
      for (const field of ['nearLat', 'nearLng', 'radiusMeters'] as const) {
        if (query[field] === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message:
              'nearLat, nearLng, and radiusMeters must be provided together.',
          });
        }
      }
    }
  });

export class ListFacilitiesQueryDto extends createZodDto(
  listFacilitiesQuerySchema,
) {
  declare readonly cursor?: string;
  declare readonly pageSize: number;
  declare readonly search?: string;
  declare readonly facilityType?: string;
  declare readonly nearLat?: number;
  declare readonly nearLng?: number;
  declare readonly radiusMeters?: number;
}

export const getFacilityParamsSchema = z
  .object({ facilityId: z.string().uuid() })
  .strict();

export class GetFacilityParamsDto extends createZodDto(
  getFacilityParamsSchema,
) {
  declare readonly facilityId: string;
}

export type FacilityOperationalClassification = z.infer<
  typeof facilityOperationalClassificationSchema
>;
export type ListFacilitiesQuery = z.infer<typeof listFacilitiesQuerySchema>;

export interface FacilityTypeResponse {
  readonly code: string;
  readonly name: string;
  readonly operationalClassification: FacilityOperationalClassification;
}

export interface FacilityLocationResponse {
  readonly latitude: number;
  readonly longitude: number;
}

export interface FacilityResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly location: FacilityLocationResponse;
  readonly facilityType: FacilityTypeResponse;
  readonly distanceMeters: number | null;
}

export type ListFacilitiesResponse = PaginatedResponse<FacilityResponse>;

export interface FacilityDiscoveryRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly facilityTypeCode: string;
  readonly facilityTypeName: string;
  readonly operationalClassification: FacilityOperationalClassification;
  readonly distanceMeters: number | null;
}

export type FacilityDiscoveryCursor =
  | {
      readonly mode: 'alphabetical';
      readonly name: string;
      readonly id: string;
      readonly queryKey: string;
    }
  | {
      readonly mode: 'nearby';
      readonly distanceMeters: number;
      readonly id: string;
      readonly queryKey: string;
    };

export interface ListFacilitiesRepositoryQuery extends ListFacilitiesQuery {
  readonly decodedCursor?: FacilityDiscoveryCursor;
}
