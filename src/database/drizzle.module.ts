import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseConfigService } from '../config/database-config.service';
import { schema } from './drizzle.schema';

export const DRIZZLE_CLIENT = Symbol('DRIZZLE_CLIENT');
export const DRIZZLE_POOL = Symbol('DRIZZLE_POOL');
export type DrizzleClient = NodePgDatabase<typeof schema>;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE_POOL,
      inject: [DatabaseConfigService],
      useFactory: (dbConfig: DatabaseConfigService): Pool => {
        return new Pool({
          connectionString: dbConfig.primaryUrl,
          max: 20,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
        });
      },
    },
    {
      provide: DRIZZLE_CLIENT,
      inject: [DRIZZLE_POOL],
      useFactory: (pool: Pool): DrizzleClient => {
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE_CLIENT, DRIZZLE_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DRIZZLE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
