import { Controller, Delete, Get, HttpCode, Inject, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DevelopmentSmsInboxGuard } from './development-sms-inbox.guard';
import { MockSmsProvider } from './mock-sms.provider';

@Public()
@UseGuards(DevelopmentSmsInboxGuard)
@Controller('development/sms-inbox')
export class DevelopmentSmsInboxController {
  constructor(
    @Inject(MockSmsProvider) private readonly mockProvider: MockSmsProvider,
  ) {}

  @Get()
  listMessages() {
    return { messages: this.mockProvider.getMessages() };
  }

  @Delete()
  @HttpCode(204)
  clearMessages(): void {
    this.mockProvider.clear();
  }
}
