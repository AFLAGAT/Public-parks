import { Inject, Injectable } from '@nestjs/common';
import type { OtpDeliveryPort } from './otp-delivery.port';
import { SmsDispatcher } from './sms-dispatcher';

@Injectable()
export class SmsOtpDeliveryAdapter implements OtpDeliveryPort {
  constructor(
    @Inject(SmsDispatcher) private readonly dispatcher: SmsDispatcher,
  ) {}

  async deliverOtp(request: {
    readonly challengeId: string;
    readonly destination: string;
    readonly otpCode: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    await this.dispatcher.send({
      destination: request.destination,
      message: `Your Public Parks verification code is ${request.otpCode}. It expires in 5 minutes.`,
      idempotencyKey: `otp:${request.challengeId}`,
      purpose: 'resident_otp',
    });
  }
}
