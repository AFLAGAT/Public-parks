import { ApplicationException } from '../common/errors/application.exception';
import { ErrorCode } from '../common/errors/error-codes';

export class AuthenticationRequiredException extends ApplicationException {
  constructor() {
    super(ErrorCode.AUTHENTICATION_REQUIRED, 'Authentication is required.');
  }
}
