import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

@Injectable()
export class DatabaseConfigService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  get primaryUrl(): string {
    return this.config.get('DB_PRIMARY_URL', { infer: true });
  }
}
