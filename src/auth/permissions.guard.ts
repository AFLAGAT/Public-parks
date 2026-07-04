import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuthenticatedActor } from './authenticated-actor.context';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const actor = getAuthenticatedActor(
      context.switchToHttp().getRequest<object>(),
    );
    if (
      !actor ||
      actor.clientType !== 'super_admin_web' ||
      !actor.roleCodes.includes('super_admin') ||
      !required.every((permission) => actor.permissionCodes.includes(permission))
    ) {
      throw new ApplicationException(
        ErrorCode.PERMISSION_DENIED,
        'Permission denied.',
      );
    }
    return true;
  }
}
