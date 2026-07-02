import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppNodeEnv, Env } from './env.schema';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): AppNodeEnv {
    return this.config.get('APP_NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.config.get('APP_PORT', { infer: true });
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get enableDocs(): boolean {
    return this.config.get('APP_ENABLE_DOCS', { infer: true });
  }
}
