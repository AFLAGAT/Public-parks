import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

@Injectable()
export class RedisConfigService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  get url(): string {
    return this.config.get('REDIS_URL', { infer: true });
  }
}
