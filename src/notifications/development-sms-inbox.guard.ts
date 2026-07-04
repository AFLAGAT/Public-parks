import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { SecurityConfigService } from '../config/security-config.service';

@Injectable()
export class DevelopmentSmsInboxGuard implements CanActivate {
  constructor(
    @Inject(SecurityConfigService)
    private readonly securityConfig: SecurityConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
    }>();
    const actual = request.headers?.['x-dev-sms-inbox-token'];
    const expected = this.securityConfig.devSmsInboxToken;
    if (
      typeof actual !== 'string' ||
      expected.length === 0 ||
      !this.isEqual(expected, actual)
    ) {
      throw new ApplicationException(ErrorCode.PERMISSION_DENIED, 'Permission denied.');
    }
    return true;
  }

  private isEqual(expected: string, actual: string): boolean {
    const expectedBytes = Buffer.from(expected, 'utf8');
    const actualBytes = Buffer.from(actual, 'utf8');
    return (
      expectedBytes.length === actualBytes.length &&
      timingSafeEqual(expectedBytes, actualBytes)
    );
  }
}
