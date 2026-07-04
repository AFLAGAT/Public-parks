import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigModule } from '../config/config.module';
import { DocsModule } from './docs.module';
import { DocsService, DOCS_PATH, DOCS_JSON_PATH } from './docs.service';
import { AppConfigService } from '../config/app-config.service';
import type { Env } from '../config/env.schema';
import type { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(overrides: Partial<Env> = {}): AppConfigService {
  const defaults: Env = {
    APP_NODE_ENV: 'development',
    APP_PORT: 3000,
    LOG_LEVEL: 'info',
    DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_dev',
    REDIS_URL: 'redis://localhost:6379/0',
    AUTH_JWT_KEYS_JSON:
      '{"dev-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
    AUTH_JWT_ACTIVE_KEY_ID: 'dev-v1',
    AUTH_OTP_HASH_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    AUTH_TOKEN_HASH_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    AUTH_CSRF_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    APP_FIELD_ENCRYPTION_KEYS_JSON:
      '{"dev-v1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
    APP_FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'dev-v1',
    SUPER_ADMIN_WEB_ORIGINS: 'http://localhost:3001',
    DEV_SMS_INBOX_TOKEN: '',
    APP_ENABLE_DOCS: false,
  };
  const env = { ...defaults, ...overrides };
  const configService = {
    get: <K extends keyof Env>(key: K): Env[K] => env[key],
  } as unknown as ConfigService<Env, true>;
  return new AppConfigService(configService);
}

/**
 * Creates a NestJS testing module with DocsModule and a mock AppConfigService,
 * returns the DocsService and a NestApplication that SwaggerModule can work with.
 */
async function createTestApp(configOverrides: Partial<Env> = {}): Promise<{
  service: DocsService;
  app: INestApplication;
}> {
  const config = makeConfigService(configOverrides);

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DocsModule],
  })
    .overrideProvider(AppConfigService)
    .useValue(config)
    .compile();

  const app = moduleRef.createNestApplication();
  const service = app.get(DocsService);
  return { service, app };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocsService', () => {
  describe('createOpenApiDocument', () => {
    it('returns a document with the correct title, description, version, and bearer auth', async () => {
      const { service, app } = await createTestApp();
      try {
        const document = service.createOpenApiDocument(app);

        expect(document.info.title).toBe('Public Recreation Facility Management Platform');
        expect(document.info.description).toContain(
          'Addis Ababa Public Recreation Facility Management Platform',
        );
        expect(document.info.version).toBe('0.1.0');

        // Verify bearer security scheme
        // Unconditional assertions ensure the test fails if the scheme is
        // {}, malformed, or lacks type, scheme, or bearerFormat. toMatchObject
        // is used instead of a conditional guard so field checks are never
        // silently skipped.
        const securitySchemes = document.components?.securitySchemes;
        expect(securitySchemes).toBeDefined();
        const accessTokenScheme: unknown = securitySchemes!['access-token'];
        expect(accessTokenScheme).toBeDefined();
        expect(accessTokenScheme).toMatchObject({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        });

        // Verify empty paths (no controllers registered yet)
        expect(document.paths).toBeDefined();
        expect(Object.keys(document.paths)).toHaveLength(0);
      } finally {
        await app.close();
      }
    });
  });

  describe('setupSwaggerUi', () => {
    let setupSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      setupSpy = vi.spyOn(SwaggerModule, 'setup');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('mounts Swagger UI at the exact path with jsonDocumentUrl and options', async () => {
      const { service, app } = await createTestApp({ APP_NODE_ENV: 'development', APP_ENABLE_DOCS: false });
      try {
        service.setupSwaggerUi(app);

        expect(setupSpy).toHaveBeenCalledTimes(1);
        const expectedOptions: Record<string, unknown> = expect.objectContaining({
          jsonDocumentUrl: DOCS_JSON_PATH,
          swaggerOptions: expect.objectContaining({
            persistAuthorization: true,
            docExpansion: 'list',
            filter: true,
            showRequestDuration: true,
          }) as Record<string, unknown>,
        }) as Record<string, unknown>;

        expect(setupSpy).toHaveBeenCalledWith(
          DOCS_PATH,
          app,
          expect.any(Object),
          expectedOptions,
      );
      } finally {
        await app.close();
      }
    });

    it('does NOT mount Swagger UI in production without APP_ENABLE_DOCS', async () => {
      const { service, app } = await createTestApp({ APP_NODE_ENV: 'production', APP_ENABLE_DOCS: false });
      try {
        service.setupSwaggerUi(app);
        expect(setupSpy).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('DOES mount Swagger UI in production when APP_ENABLE_DOCS=true', async () => {
      const { service, app } = await createTestApp({ APP_NODE_ENV: 'production', APP_ENABLE_DOCS: true });
      try {
        service.setupSwaggerUi(app);
        expect(setupSpy).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    });

    it('mounts Swagger UI in development by default', async () => {
      const { service, app } = await createTestApp({ APP_NODE_ENV: 'development', APP_ENABLE_DOCS: false });
      try {
        service.setupSwaggerUi(app);
        expect(setupSpy).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    });

    it('mounts Swagger UI in test by default', async () => {
      const { service, app } = await createTestApp({ APP_NODE_ENV: 'test', APP_ENABLE_DOCS: false });
      try {
        service.setupSwaggerUi(app);
        expect(setupSpy).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    });

    it('does NOT mount Swagger UI in staging without APP_ENABLE_DOCS', async () => {
      const { service, app } = await createTestApp({ APP_NODE_ENV: 'staging', APP_ENABLE_DOCS: false });
      try {
        service.setupSwaggerUi(app);
        expect(setupSpy).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('DOES mount Swagger UI in staging when APP_ENABLE_DOCS=true', async () => {
      const { service, app } = await createTestApp({ APP_NODE_ENV: 'staging', APP_ENABLE_DOCS: true });
      try {
        service.setupSwaggerUi(app);
        expect(setupSpy).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    });
  });

  describe('module compilation', () => {
    it('compiles DocsModule and resolves DocsService', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigModule, DocsModule],
      })
        .overrideProvider(AppConfigService)
        .useValue(makeConfigService())
        .compile();

      const service = moduleRef.get(DocsService);
      expect(service).toBeInstanceOf(DocsService);
      await moduleRef.close();
    });
  });

  describe('DOCS_PATH and DOCS_JSON_PATH constants', () => {
    it('exports expected path constants', () => {
      expect(DOCS_PATH).toBe('docs');
      expect(DOCS_JSON_PATH).toBe('docs-json');
    });
  });
});
