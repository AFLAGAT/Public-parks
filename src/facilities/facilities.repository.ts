import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import {
  DRIZZLE_CLIENT,
  type DrizzleClient,
} from '../database/drizzle.module';
import { facilities, facilityTypes } from '../database/drizzle.schema';
import type {
  FacilityDiscoveryRow,
  ListFacilitiesRepositoryQuery,
} from './facilities.types';

@Injectable()
export class FacilitiesRepository {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly database: DrizzleClient,
  ) {}

  async listFacilities(
    query: ListFacilitiesRepositoryQuery,
  ): Promise<FacilityDiscoveryRow[]> {
    const distanceExpression = this.createDistanceExpression(query);
    const conditions: SQL[] = [
      eq(facilities.isActive, true),
      eq(facilityTypes.isActive, true),
    ];

    if (query.facilityType !== undefined) {
      conditions.push(eq(facilityTypes.code, query.facilityType));
    }

    if (query.search !== undefined) {
      const searchPattern = `%${query.search}%`;
      const searchCondition = or(
        ilike(facilities.name, searchPattern),
        ilike(facilities.address, searchPattern),
        ilike(facilities.description, searchPattern),
      );
      if (searchCondition !== undefined) {
        conditions.push(searchCondition);
      }
    }

    if (
      query.nearLat !== undefined &&
      query.nearLng !== undefined &&
      query.radiusMeters !== undefined
    ) {
      conditions.push(sql`ST_DWithin(
        ${facilities.location}::geography,
        ST_SetSRID(ST_MakePoint(${query.nearLng}, ${query.nearLat}), 4326)::geography,
        ${query.radiusMeters}
      )`);
    }

    if (query.decodedCursor?.mode === 'alphabetical') {
      conditions.push(
        or(
          gt(facilities.name, query.decodedCursor.name),
          and(
            eq(facilities.name, query.decodedCursor.name),
            gt(facilities.id, query.decodedCursor.id),
          ),
        ) as SQL,
      );
    }

    if (
      query.decodedCursor?.mode === 'nearby' &&
      distanceExpression !== null
    ) {
      conditions.push(sql`(
        ${distanceExpression} > ${query.decodedCursor.distanceMeters}
        OR (
          ${distanceExpression} = ${query.decodedCursor.distanceMeters}
          AND ${facilities.id} > ${query.decodedCursor.id}
        )
      )`);
    }

    const selection = {
      id: facilities.id,
      name: facilities.name,
      description: facilities.description,
      address: facilities.address,
      longitude: sql<number>`ST_X(${facilities.location})`,
      latitude: sql<number>`ST_Y(${facilities.location})`,
      facilityTypeCode: facilityTypes.code,
      facilityTypeName: facilityTypes.name,
      operationalClassification: facilityTypes.operationalClassification,
      distanceMeters:
        distanceExpression ?? sql<null>`NULL`,
    };

    const baseQuery = this.database
      .select(selection)
      .from(facilities)
      .innerJoin(
        facilityTypes,
        eq(facilities.facilityTypeId, facilityTypes.id),
      )
      .where(and(...conditions));

    const limit = query.pageSize + 1;
    if (distanceExpression !== null) {
      return baseQuery
        .orderBy(asc(distanceExpression), asc(facilities.id))
        .limit(limit);
    }

    return baseQuery
      .orderBy(asc(facilities.name), asc(facilities.id))
      .limit(limit);
  }

  async getFacility(facilityId: string): Promise<FacilityDiscoveryRow | null> {
    const rows = await this.database
      .select({
        id: facilities.id,
        name: facilities.name,
        description: facilities.description,
        address: facilities.address,
        longitude: sql<number>`ST_X(${facilities.location})`,
        latitude: sql<number>`ST_Y(${facilities.location})`,
        facilityTypeCode: facilityTypes.code,
        facilityTypeName: facilityTypes.name,
        operationalClassification: facilityTypes.operationalClassification,
        distanceMeters: sql<null>`NULL`,
      })
      .from(facilities)
      .innerJoin(
        facilityTypes,
        eq(facilities.facilityTypeId, facilityTypes.id),
      )
      .where(
        and(
          eq(facilities.id, facilityId),
          eq(facilities.isActive, true),
          eq(facilityTypes.isActive, true),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  private createDistanceExpression(
    query: ListFacilitiesRepositoryQuery,
  ): SQL<number> | null {
    if (query.nearLat === undefined || query.nearLng === undefined) {
      return null;
    }

    return sql<number>`ST_Distance(
      ${facilities.location}::geography,
      ST_SetSRID(ST_MakePoint(${query.nearLng}, ${query.nearLat}), 4326)::geography
    )`;
  }
}
