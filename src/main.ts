import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { DocsService } from './docs/docs.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoNestLogger));
  app.flushLogs();
  app.setGlobalPrefix('v1');

  const config = app.get(AppConfigService);

  // Mount OpenAPI / Swagger UI if not disabled by policy (disabled in
  // production unless APP_ENABLE_DOCS=true is explicitly set).
  const docsService = app.get(DocsService);
  docsService.setupSwaggerUi(app);

  await app.listen(config.port);
}

void bootstrap();
