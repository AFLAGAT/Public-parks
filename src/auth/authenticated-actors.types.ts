/**
 * Identity established by a trusted authentication mechanism.
 *
 * The Phase 2 skeleton intentionally carries only the stable actor identifier.
 * Phase 4 token verification will create this value after validating a token;
 * role, permission, client, and facility scope remain authorization concerns.
 */
export interface AuthenticatedActor {
  readonly actorId: string;
}
