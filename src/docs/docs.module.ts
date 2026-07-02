import { Module } from '@nestjs/common';
import { DocsService } from './docs.service';

/**
 * Module that configures OpenAPI / Swagger documentation for the platform.
 *
 * Imports: none (uses global ConfigModule for AppConfigService via DI).
 * Exports: DocsService so other modules or the generator script can reuse it
 *   without importing the docs module directly.
 *
 * The actual Swagger UI setup happens in main.ts via DocsService.setupSwaggerUi(),
 * not in a controller — this module owns the configuration, not HTTP routes.
 */
@Module({
  providers: [DocsService],
  exports: [DocsService],
})
export class DocsModule {}
