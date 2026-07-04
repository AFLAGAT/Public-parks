import { describe, expect, it } from 'vitest';
import { MockSmsProvider } from './mock-sms.provider';

const configuration = {
  apiUrl: null,
  credentials: {},
  senderId: null,
  timeoutMs: 10_000,
  retryCount: 1,
};

describe('MockSmsProvider', () => {
  it('keeps OTP content in its bounded inbox rather than logging it', async () => {
    const provider = new MockSmsProvider();
    for (let index = 0; index < 105; index += 1) {
      await provider.sendSms({
        destination: '+12025550123',
        message: `code-${String(index)}`,
        idempotencyKey: String(index),
        configuration,
        signal: new AbortController().signal,
      });
    }

    const messages = provider.getMessages();
    expect(messages).toHaveLength(100);
    expect(messages[0]?.message).toBe('code-104');
    expect(messages.at(-1)?.message).toBe('code-5');
  });

  it('accepts no API URL or credentials', () => {
    const provider = new MockSmsProvider();
    expect(provider.validateConfiguration(configuration)).toEqual([]);
    expect(
      provider.validateConfiguration({
        ...configuration,
        apiUrl: 'https://example.com',
        credentials: { apiKey: 'secret' },
      }),
    ).toHaveLength(2);
  });
});
