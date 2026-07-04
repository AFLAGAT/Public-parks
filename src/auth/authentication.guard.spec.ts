import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { assignAuthenticatedActor } from './authenticated-actor.context';
import { AuthenticationGuard } from './authentication.guard';
import { AuthenticationRequiredException } from './authentication-required.exception';

class FixtureController {
  getProtected(this: void): void {}
}

function createExecutionContext(request: object): ExecutionContext {
  return {
    getClass: () => FixtureController,
    getHandler: () => FixtureController.prototype.getProtected,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthenticationGuard', () => {
  const guard = new AuthenticationGuard(new Reflector());

  it('allows a protected handler after trusted authentication assigns an actor', () => {
    const request = {};
    assignAuthenticatedActor(request, {
      actorId: 'resident-123',
      sessionId: 'session-123',
      clientType: 'resident_mobile',
      roleCodes: [],
      permissionCodes: [],
    });

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('throws the stable authentication exception when no actor is established', () => {
    expect(() => guard.canActivate(createExecutionContext({}))).toThrow(
      AuthenticationRequiredException,
    );
  });
});
