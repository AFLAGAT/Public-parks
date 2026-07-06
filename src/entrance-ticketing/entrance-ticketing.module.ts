import { Module } from '@nestjs/common';
import { EntranceTicketStatePolicy } from './entrance-ticket-state.policy';

@Module({
  providers: [EntranceTicketStatePolicy],
  exports: [EntranceTicketStatePolicy],
})
export class EntranceTicketingModule {}
