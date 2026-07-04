import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE_KEY } from './auth.constants';
import { getAuthenticatedActor } from './authenticated-actor.context';
import { AuthenticationRequiredException } from './authentication-required.exception';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  // Explicit injection keeps this resolvable in the Vitest/esbuild test runtime,
  // which does not emit TypeScript decorator metadata.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublicRoute === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<object>();
    if (getAuthenticatedActor(request)) {
      return true;
    }

    // Raw credentials are deliberately not interpreted here. AccessTokenGuard
    // runs first and assigns an actor only after JWT and live-session checks.
    throw new AuthenticationRequiredException();
  }
}
