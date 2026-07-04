import { describe, expect, it, vi } from 'vitest';
import type { SmsConfigurationRepository } from './sms-configuration.repository';
import { SmsConfigurationResolver } from './sms-configuration.resolver';

describe('SmsConfigurationResolver', () => {
  it('accepts future city context while resolving the platform configuration today', async () => {
    const resolvePlatformActive = vi.fn().mockResolvedValue(null);
    const repository = {
      resolvePlatformActive,
    } as unknown as SmsConfigurationRepository;
    const resolver = new SmsConfigurationResolver(repository);

    await expect(
      resolver.resolve({ cityId: '11111111-1111-4111-8111-111111111111' }),
    ).resolves.toBeNull();
    expect(resolvePlatformActive).toHaveBeenCalledOnce();
  });
});
