import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AuthenticationRepository } from './authentication.repository';
import { assignAuthenticatedActor } from './authenticated-actor.context';
import { AuthenticationFailedException } from './authentication-failed.exception';
import { JwtTokenService } from './jwt-token.service';

interface RequestWithHeaders {
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(JwtTokenService) private readonly tokens: JwtTokenService,
    @Inject(AuthenticationRepository)
    private readonly repository: AuthenticationRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const authorization = request.headers?.authorization;
    if (authorization === undefined) {
      return true;
    }
    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') ||
      authorization.length <= 7
    ) {
      throw new AuthenticationFailedException();
    }
    const claims = await this.tokens.verifyAccessToken(authorization.slice(7));
    const actor = await this.repository.getAuthenticatedActor(
      claims.userId,
      claims.sessionId,
      claims.clientType,
    );
    if (!actor) {
      throw new AuthenticationFailedException();
    }
    assignAuthenticatedActor(request, actor);
    return true;
  }
}
