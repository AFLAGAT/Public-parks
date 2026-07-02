import type { AuthenticatedActor } from './authenticated-actors.types';

/**
 * Keeps authenticated identity off enumerable request fields. In particular,
 * neither an `authenticatedActor` request-body field nor a similarly named
 * header can create trusted identity. Only server-side token verification may
 * call assignAuthenticatedActor after it has established the actor.
 */
const authenticatedActorsByRequest = new WeakMap<object, AuthenticatedActor>();

export function assignAuthenticatedActor(request: object, actor: AuthenticatedActor): void {
  authenticatedActorsByRequest.set(request, Object.freeze({ ...actor }));
}

export function getAuthenticatedActor(request: object): AuthenticatedActor | undefined {
  return authenticatedActorsByRequest.get(request);
}
