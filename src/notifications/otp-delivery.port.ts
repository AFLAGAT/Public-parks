export const OTP_DELIVERY_PORT = Symbol('OTP_DELIVERY_PORT');

/** Authentication's only dependency on message delivery. */
export interface OtpDeliveryPort {
  deliverOtp(request: {
    readonly challengeId: string;
    readonly destination: string;
    readonly otpCode: string;
    readonly expiresAt: Date;
  }): Promise<void>;
}
