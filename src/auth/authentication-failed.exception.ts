import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';

export class AuthenticationFailedException extends ApplicationException {
  constructor() {
    super(ErrorCode.AUTHENTICATION_FAILED, 'Authentication failed.');
  }
}
