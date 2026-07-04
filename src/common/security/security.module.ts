import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { FieldEncryptionService } from './field-encryption.service';
import { SecretHashService } from './secret-hash.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [FieldEncryptionService, SecretHashService],
  exports: [FieldEncryptionService, SecretHashService],
})
export class SecurityModule {}
