import { describe, expect, it } from 'vitest';
import { MockSmsProvider } from './mock-sms.provider';
import { SmsProviderRegistry } from './sms-provider.registry';

describe('SmsProviderRegistry', () => {
  it('resolves providers only by their stable key', () => {
    const mock = new MockSmsProvider();
    const registry = new SmsProviderRegistry([mock]);

    expect(registry.get('mock')).toBe(mock);
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.list()).toEqual([mock]);
  });

  it('rejects duplicate provider keys at startup', () => {
    expect(() => new SmsProviderRegistry([new MockSmsProvider(), new MockSmsProvider()])).toThrow(
      'SMS provider keys must be unique.',
    );
  });
});
