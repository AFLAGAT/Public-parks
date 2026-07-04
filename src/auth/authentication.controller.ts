import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  Inject,
  Ip,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { SecurityConfigService } from '../config/security-config.service';
import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { getAuthenticatedActor } from './authenticated-actor.context';
import { AuthenticationService } from './authentication.service';
import {
  CreateOtpChallengeDto,
  CreateResidentSessionDto,
  CreateSuperAdminChallengeDto,
  CreateSuperAdminSessionDto,
  RefreshResidentSessionDto,
  RevokeSessionParamsDto,
} from './authentication.types';
import { AuthenticationRepository } from './authentication.repository';
import { Public } from './public.decorator';

const ADMIN_REFRESH_COOKIE = '__Host-parks_admin_refresh';

interface RequestWithHeaders {
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseLike;
  send(body?: unknown): void;
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    }
  }
  return null;
}

@Controller('auth')
export class AuthenticationController {
  constructor(
    @Inject(AuthenticationService)
    private readonly authentication: AuthenticationService,
    @Inject(AuthenticationRepository)
    private readonly repository: AuthenticationRepository,
    @Inject(SecurityConfigService)
    private readonly securityConfig: SecurityConfigService,
  ) {}

  @Public()
  @Post('otp-challenges')
  createOtpChallenge(@Body() body: CreateOtpChallengeDto, @Ip() ip: string) {
    return this.authentication.createOtpChallenge(body.phoneNumber, ip);
  }

  @Public()
  @Post('resident-sessions')
  createResidentSession(@Body() body: CreateResidentSessionDto) {
    return this.authentication.createResidentSession(body);
  }

  @Public()
  @Post('resident-session-refreshes')
  refreshResidentSession(@Body() body: RefreshResidentSessionDto) {
    return this.authentication.refreshResidentSession(body.refreshToken);
  }

  @Public()
  @Post('super-admin-challenges')
  createSuperAdminChallenge(
    @Body() body: CreateSuperAdminChallengeDto,
    @Ip() ip: string,
  ) {
    return this.authentication.createSuperAdminChallenge(
      body.email,
      body.password,
      ip,
    );
  }

  @Public()
  @Post('super-admin-sessions')
  async createSuperAdminSession(
    @Body() body: CreateSuperAdminSessionDto,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    const result = await this.authentication.createSuperAdminSession(
      body.challengeId,
      body.verificationCode,
    );
    this.setRefreshCookie(response, result.refreshToken as string);
    return this.safeAdminTokens(result);
  }

  @Public()
  @Post('super-admin-session-refreshes')
  async refreshSuperAdminSession(
    @Req() request: RequestWithHeaders,
    @Headers('origin') origin: string | undefined,
    @Headers('x-csrf-token') csrfToken: string | undefined,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    this.assertAllowedOrigin(origin);
    const cookieHeader = request.headers?.cookie;
    const refreshToken = parseCookie(
      typeof cookieHeader === 'string' ? cookieHeader : undefined,
      ADMIN_REFRESH_COOKIE,
    );
    if (!refreshToken || !csrfToken) {
      throw new ApplicationException(
        ErrorCode.AUTHENTICATION_FAILED,
        'Authentication failed.',
      );
    }
    const result = await this.authentication.refreshSuperAdminSession(
      refreshToken,
      csrfToken,
    );
    this.setRefreshCookie(response, result.refreshToken as string);
    return this.safeAdminTokens(result);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(
    @Param() params: RevokeSessionParamsDto,
    @Req() request: object,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    const actor = getAuthenticatedActor(request);
    if (!actor || !(await this.repository.revokeSession(params.sessionId, actor.actorId))) {
      throw new ApplicationException(ErrorCode.PERMISSION_DENIED, 'Permission denied.');
    }
    response.setHeader(
      'Set-Cookie',
      `${ADMIN_REFRESH_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`,
    );
  }

  private assertAllowedOrigin(origin: string | undefined): void {
    if (!origin || !this.securityConfig.superAdminWebOrigins.includes(origin)) {
      throw new ApplicationException(ErrorCode.PERMISSION_DENIED, 'Permission denied.');
    }
  }

  private setRefreshCookie(response: ResponseLike, refreshToken: string): void {
    response.setHeader(
      'Set-Cookie',
      `${ADMIN_REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Strict`,
    );
  }

  private safeAdminTokens(result: {
    readonly accessToken: string;
    readonly accessTokenExpiresAt: string;
    readonly refreshTokenExpiresAt: string;
    readonly sessionId: string;
    readonly userId: string;
    readonly csrfToken: string;
  }) {
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      sessionId: result.sessionId,
      userId: result.userId,
      csrfToken: result.csrfToken,
    };
  }
}
