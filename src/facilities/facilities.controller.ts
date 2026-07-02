import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { FacilitiesService } from './facilities.service';
import {
  GetFacilityParamsDto,
  ListFacilitiesQueryDto,
  type FacilityResponse,
  type ListFacilitiesResponse,
} from './facilities.types';

type OpenApiSchema = NonNullable<
  NonNullable<OpenAPIObject['components']>['schemas']
>[string];

const FACILITY_OPEN_API_SCHEMA: OpenApiSchema = {
  type: 'object',
  required: [
    'id',
    'name',
    'description',
    'address',
    'location',
    'facilityType',
    'distanceMeters',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    address: { type: 'string' },
    location: {
      type: 'object',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: { type: 'number', format: 'double' },
        longitude: { type: 'number', format: 'double' },
      },
    },
    facilityType: {
      type: 'object',
      required: ['code', 'name', 'operationalClassification'],
      properties: {
        code: { type: 'string' },
        name: { type: 'string' },
        operationalClassification: {
          type: 'string',
          enum: ['slot_based', 'entrance_based'],
        },
      },
    },
    distanceMeters: { type: 'number', nullable: true },
  },
};

const FACILITY_LIST_OPEN_API_SCHEMA: OpenApiSchema = {
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: { type: 'array', items: FACILITY_OPEN_API_SCHEMA },
    pagination: {
      type: 'object',
      required: ['nextCursor', 'hasMore'],
      properties: {
        nextCursor: { type: 'string', nullable: true },
        hasMore: { type: 'boolean' },
      },
    },
  },
};

@Public()
@ApiTags('facilities')
@Controller('facilities')
export class FacilitiesController {
  constructor(
    @Inject(FacilitiesService)
    private readonly facilitiesService: FacilitiesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List public facilities' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'facilityType', required: false, type: String })
  @ApiQuery({ name: 'nearLat', required: false, type: Number })
  @ApiQuery({ name: 'nearLng', required: false, type: Number })
  @ApiQuery({ name: 'radiusMeters', required: false, type: Number })
  @ApiOkResponse({
    description: 'A bounded page of active public facilities.',
    schema: FACILITY_LIST_OPEN_API_SCHEMA,
  })
  listFacilities(
    @Query() query: ListFacilitiesQueryDto,
  ): Promise<ListFacilitiesResponse> {
    return this.facilitiesService.listFacilities(query);
  }

  @Get(':facilityId')
  @ApiOperation({ summary: 'Get public facility details' })
  @ApiParam({ name: 'facilityId', type: String, format: 'uuid' })
  @ApiOkResponse({
    description: 'Approved public facility details.',
    schema: FACILITY_OPEN_API_SCHEMA,
  })
  @ApiNotFoundResponse({ description: 'Facility was not found.' })
  getFacility(
    @Param() params: GetFacilityParamsDto,
  ): Promise<FacilityResponse> {
    return this.facilitiesService.getFacility(params.facilityId);
  }
}
