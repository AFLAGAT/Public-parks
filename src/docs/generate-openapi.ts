#!/usr/bin/env tsx
/**
 * Standalone script to generate the OpenAPI JSON contract without starting
 * the HTTP server or connecting to a live database.
 *
 * Usage:
 *   npm run docs:generate
 *
 * The npm script sets APP_NODE_ENV, DB_PRIMARY_URL, and APP_ENABLE_DOCS
 * before tsx starts, so the config validation passes at module-init time.
 *
 * Output: dist/openapi.json (relative to project root)
 *
 * Lifecycle rules:
 * - Exactly one lifecycle owner is closed per execution path.
 * - If the NestJS application was created, only the application is closed.
 * - If only the TestingModule was compiled (application creation failed),
 *   only the TestingModule is closed.
 * - "Generator exited cleanly." is printed only after successful cleanup.
 * - Cleanup failures produce a nonzero exit code and a clear log message.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { DRIZZLE_CLIENT, DRIZZLE_POOL } from '../database/drizzle.module';
import { DocsService } from './docs.service';
import type { INestApplication } from '@nestjs/common';

async function generateOpenApi(): Promise<void> {
  let moduleRef: TestingModule | null = null;
  let app: INestApplication | null = null;

  try {
    // ------------------------------------------------------------------
    // 1. Bootstrap AppModule with stubbed database providers
    //    No live database connection is attempted.
    // ------------------------------------------------------------------
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE_POOL)
      .useValue({
        end: () => Promise.resolve(),
        totalCount: 0,
        waitingCount: 0,
        idleCount: 0,
      })
      .overrideProvider(DRIZZLE_CLIENT)
      .useValue({
        select: () => ({ from: () => Promise.resolve([]) }),
        insert: () => ({ values: () => Promise.resolve([]) }),
        update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
        delete: () => ({ where: () => Promise.resolve([]) }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');

    // ------------------------------------------------------------------
    // 2. Generate OpenAPI document
    // ------------------------------------------------------------------
    const docsService = app.get(DocsService);
    const document = docsService.createOpenApiDocument(app);

    // ------------------------------------------------------------------
    // 3. Write output
    // ------------------------------------------------------------------
    const outDir = path.resolve(__dirname, '..', '..', 'dist');
    const outPath = path.join(outDir, 'openapi.json');

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const json = JSON.stringify(document, null, 2);
    fs.writeFileSync(outPath, json, 'utf-8');

    console.log(`OpenAPI contract written to ${outPath}`);
    console.log(`  Title:       ${document.info.title}`);
    console.log(`  Version:     ${document.info.version}`);
    console.log(`  Paths:       ${Object.keys(document.paths ?? {}).length}`);
    console.log(`  Components:  ${Object.keys(document.components ?? {}).length}`);
    console.log(`  Auth schemes: ${Object.keys(document.components?.securitySchemes ?? {}).length}`);

    // ------------------------------------------------------------------
    // 4. Primary cleanup — close exactly one lifecycle owner.
    //    If the application was created, close only the application.
    //    Setting both references to null prevents the finally block from
    //    attempting a second close of either resource.
    // ------------------------------------------------------------------
    if (app) {
      await app.close();
      app = null;
      moduleRef = null;
    }

    console.log('Generator exited cleanly.');
  } catch (error) {
    console.error('OpenAPI generation failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    // ------------------------------------------------------------------
    // 5. Fallback cleanup — close whichever resource is still open.
    //    If app exists (primary cleanup didn't run or failed before close),
    //    close only the application. If only moduleRef exists (application
    //    creation failed after compilation), close only the moduleRef.
    //    Never close both on the same execution path.
    //    Each close attempt is individually wrapped in try/catch so one
    //    failure does not prevent the other from attempting cleanup.
    //    Cleanup failures log clearly and produce a nonzero exit code.
    // ------------------------------------------------------------------
    try {
      if (app) {
        await app.close();
      }
    } catch (closeError) {
      console.error(
        'Failed to close NestJS application during fallback cleanup:',
        closeError instanceof Error ? closeError.message : String(closeError),
      );
      process.exitCode = 1;
    }
    try {
      if (!app && moduleRef) {
        await moduleRef.close();
      }
    } catch (closeError) {
      console.error(
        'Failed to close testing module during fallback cleanup:',
        closeError instanceof Error ? closeError.message : String(closeError),
      );
      process.exitCode = 1;
    }
  }
}

void generateOpenApi();
