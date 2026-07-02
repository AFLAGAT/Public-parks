import { Inject, Injectable, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '../config/app-config.service';

export const DOCS_PATH = 'docs';
export const DOCS_JSON_PATH = 'docs-json';

/**
 * Service responsible for OpenAPI document configuration and Swagger UI setup.
 *
 * The document title, description, and version are maintained here as the
 * single source of truth for API contract metadata.
 *
 * A placeholder BearerAuth scheme is declared to match the roadmap — JWT-based
 * token authentication is planned for Phase 4/5. It is NOT implemented yet;
 * it is documented here so generated API clients can reserve the auth header.
 */
@Injectable()
export class DocsService {
  private readonly apiTitle = 'Public Recreation Facility Management Platform';
  private readonly apiDescription =
    'Backend API for the Addis Ababa Public Recreation Facility Management Platform. ' +
    'Serves the resident mobile app, staff enforcement app, and admin web dashboard.';
  private readonly apiVersion = '0.1.0';
  private readonly apiBearerAuthName = 'access-token';

  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  /**
   * Returns a fully configured OpenAPI document for the given application.
   * The document includes title, description, version, and a placeholder
   * bearer-auth scheme. No paths are included if no controllers exist —
   * this is intentional; controllers are added by later phase checklist items.
   */
  createOpenApiDocument(app: INestApplication): OpenAPIObject {
    const builder = new DocumentBuilder()
      .setTitle(this.apiTitle)
      .setDescription(this.apiDescription)
      .setVersion(this.apiVersion)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'JWT access token. Issued via the authentication API (Phase 4/5). ' +
            'This auth scheme is declared as a roadmap placeholder — token validation ' +
            'is not yet implemented.',
        },
        this.apiBearerAuthName,
      );

    return SwaggerModule.createDocument(app, builder.build());
  }

  /**
   * Mounts Swagger UI and the OpenAPI JSON endpoint on the application.
   *
   * Docs are enabled by default only in development and test environments.
   * In staging and production, both are disabled by default — set
   * APP_ENABLE_DOCS=true explicitly to override. Only enable in staging
   * for QA or internal API consumers; never enable in production-user-facing
   * deployments.
   */
  setupSwaggerUi(app: INestApplication): void {
    if (!this.shouldEnableDocs()) {
      return;
    }

    const document = this.createOpenApiDocument(app);
    SwaggerModule.setup(DOCS_PATH, app, document, {
      jsonDocumentUrl: DOCS_JSON_PATH,
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  /**
   * Determines whether interactive docs should be served.
   *
   * Docs are enabled when:
   * - The environment is development or test (safe-by-default for local
   *   and CI work), OR
   * - APP_ENABLE_DOCS is explicitly set to true (overrides for staging QA
   *   or specific production debugging under controlled access).
   *
   * In staging and production, docs are disabled by default regardless of
   * APP_NODE_ENV. This prevents accidental exposure of API contract
   * metadata in environments closest to real traffic without an explicit
   * opt-in.
   */
  private shouldEnableDocs(): boolean {
    if (this.config.enableDocs) {
      return true;
    }
    return this.config.isDevelopment || this.config.isTest;
  }
}
