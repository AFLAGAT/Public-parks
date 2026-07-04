/**
 * Identity established by a trusted authentication mechanism.
 *
 * Created only after access-token verification and a live-session lookup.
 * Client, role, and permission claims are loaded server-side rather than
 * trusted from request input or stale token fields.
 */
export interface AuthenticatedActor {
  readonly actorId: string;
  readonly sessionId: string;
  readonly clientType:
    | 'resident_mobile'
    | 'super_admin_web'
    | 'city_admin_web'
    | 'gate_worker_mobile';
  readonly roleCodes: readonly string[];
  readonly permissionCodes: readonly string[];
}
