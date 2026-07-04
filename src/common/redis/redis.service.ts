import {
  Inject,
  Injectable,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { RedisConfigService } from '../../config/redis-config.service';

@Injectable()
export class RedisService
  implements OnApplicationShutdown
{
  readonly client: RedisClientType;

  constructor(
    @Inject(RedisConfigService)
    redisConfig: RedisConfigService,
  ) {
    this.client = createClient({ url: redisConfig.url });
    this.client.on('error', () => {
      // Connection failures are surfaced by awaited commands and readiness;
      // never log URLs or Redis AUTH material here.
    });
  }

  async ensureConnected(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }
}
