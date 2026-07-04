import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';

@Injectable()
export class RateLimitService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async assertWithinLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    await this.redis.ensureConnected();
    const results = await this.redis.client
      .multi()
      .incr(key)
      .expire(key, windowSeconds, 'NX')
      .exec();
    const count = Number(results[0]);
    if (count > limit) {
      throw new ApplicationException(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Too many requests. Try again later.',
      );
    }
  }

  async assertCooldown(key: string, seconds: number): Promise<void> {
    await this.redis.ensureConnected();
    const result = await this.redis.client.set(key, '1', {
      EX: seconds,
      NX: true,
    });
    if (result !== 'OK') {
      throw new ApplicationException(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        'Please wait before requesting another code.',
      );
    }
  }
}
