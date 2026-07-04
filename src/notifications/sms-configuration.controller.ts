import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { getAuthenticatedActor } from '../auth/authenticated-actor.context';
import { SMS_PROVIDER_CONFIGURATIONS_MANAGE_PERMISSION } from '../auth/permissions.constants';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { AuthenticationRequiredException } from '../auth/authentication-required.exception';
import { getRequestCorrelationId } from '../common/logging/request-correlation.util';
import { SmsConfigurationService } from './sms-configuration.service';
import {
  CreateSmsConfigurationDto,
  CreateSmsRevisionDto,
  PatchSmsConfigurationDto,
  SmsConfigurationParamsDto,
  TestSmsConfigurationDto,
} from './sms-configuration.types';

@Controller()
@RequirePermissions(SMS_PROVIDER_CONFIGURATIONS_MANAGE_PERMISSION)
export class SmsConfigurationController {
  constructor(
    @Inject(SmsConfigurationService)
    private readonly configurations: SmsConfigurationService,
  ) {}

  @Get('sms-provider-implementations')
  listImplementations() {
    return this.configurations.listImplementations();
  }

  @Get('sms-provider-configurations')
  listConfigurations() {
    return this.configurations.listConfigurations();
  }

  @Post('sms-provider-configurations')
  createConfiguration(@Body() body: CreateSmsConfigurationDto, @Req() request: object) {
    return this.configurations.create(
      body,
      this.actorId(request),
      getRequestCorrelationId(request),
    );
  }

  @Get('sms-provider-configurations/:smsProviderConfigurationId')
  getConfiguration(@Param() params: SmsConfigurationParamsDto) {
    return this.configurations.getConfiguration(params.smsProviderConfigurationId);
  }

  @Patch('sms-provider-configurations/:smsProviderConfigurationId')
  patchConfiguration(
    @Param() params: SmsConfigurationParamsDto,
    @Body() body: PatchSmsConfigurationDto,
    @Req() request: object,
  ) {
    return this.configurations.patch(
      params.smsProviderConfigurationId,
      body,
      this.actorId(request),
      getRequestCorrelationId(request),
    );
  }

  @Post('sms-provider-configurations/:smsProviderConfigurationId/revisions')
  createRevision(
    @Param() params: SmsConfigurationParamsDto,
    @Body() body: CreateSmsRevisionDto,
    @Req() request: object,
  ) {
    return this.configurations.createRevision(
      params.smsProviderConfigurationId,
      body,
      this.actorId(request),
      getRequestCorrelationId(request),
    );
  }

  @Post('sms-provider-configurations/:smsProviderConfigurationId/tests')
  testConfiguration(
    @Param() params: SmsConfigurationParamsDto,
    @Body() body: TestSmsConfigurationDto,
    @Req() request: object,
  ) {
    return this.configurations.test(
      params.smsProviderConfigurationId,
      body.destination,
      this.actorId(request),
      getRequestCorrelationId(request),
    );
  }

  @Post('sms-provider-configurations/:smsProviderConfigurationId/activations')
  activateConfiguration(
    @Param() params: SmsConfigurationParamsDto,
    @Req() request: object,
  ) {
    return this.configurations.activate(
      params.smsProviderConfigurationId,
      this.actorId(request),
      getRequestCorrelationId(request),
    );
  }

  @Post('sms-provider-configurations/:smsProviderConfigurationId/deactivations')
  deactivateConfiguration(
    @Param() params: SmsConfigurationParamsDto,
    @Req() request: object,
  ) {
    return this.configurations.deactivate(
      params.smsProviderConfigurationId,
      this.actorId(request),
      getRequestCorrelationId(request),
    );
  }

  private actorId(request: object): string {
    const actor = getAuthenticatedActor(request);
    if (!actor) throw new AuthenticationRequiredException();
    return actor.actorId;
  }
}
