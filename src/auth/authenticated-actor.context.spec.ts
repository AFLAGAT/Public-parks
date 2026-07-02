import { describe, expect, it } from 'vitest';
import { assignAuthenticatedActor, getAuthenticatedActor } from './authenticated-actor.context';

describe('authenticated actor context', () => {
  it('returns identity assigned by trusted server-side authentication code', () => {
    const request = {};

    assignAuthenticatedActor(request, { actorId: 'resident-123' });

    expect(getAuthenticatedActor(request)).toEqual({ actorId: 'resident-123' });
  });

  it('does not trust an enumerable request property with the same conceptual name', () => {
    const request = {
      authenticatedActor: { actorId: 'attacker-controlled' },
    };

    expect(getAuthenticatedActor(request)).toBeUndefined();
  });

  it('stores an immutable copy rather than a caller-owned actor object', () => {
    const request = {};
    const actor = { actorId: 'resident-123' };

    assignAuthenticatedActor(request, actor);
    actor.actorId = 'changed-after-assignment';

    expect(getAuthenticatedActor(request)).toEqual({ actorId: 'resident-123' });
    expect(Object.isFrozen(getAuthenticatedActor(request))).toBe(true);
  });
});
