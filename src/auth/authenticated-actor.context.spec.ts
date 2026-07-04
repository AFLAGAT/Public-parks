import { describe, expect, it } from 'vitest';
import { assignAuthenticatedActor, getAuthenticatedActor } from './authenticated-actor.context';

describe('authenticated actor context', () => {
  const assignedActor = {
    actorId: 'resident-123',
    sessionId: 'session-123',
    clientType: 'resident_mobile' as const,
    roleCodes: [] as string[],
    permissionCodes: [] as string[],
  };

  it('returns identity assigned by trusted server-side authentication code', () => {
    const request = {};

    assignAuthenticatedActor(request, assignedActor);

    expect(getAuthenticatedActor(request)).toEqual(assignedActor);
  });

  it('does not trust an enumerable request property with the same conceptual name', () => {
    const request = {
      authenticatedActor: { actorId: 'attacker-controlled' },
    };

    expect(getAuthenticatedActor(request)).toBeUndefined();
  });

  it('stores an immutable copy rather than a caller-owned actor object', () => {
    const request = {};
    const actor = { ...assignedActor };

    assignAuthenticatedActor(request, actor);
    actor.actorId = 'changed-after-assignment';

    expect(getAuthenticatedActor(request)).toEqual(assignedActor);
    expect(Object.isFrozen(getAuthenticatedActor(request))).toBe(true);
  });
});
