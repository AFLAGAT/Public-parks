import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_ROUTE_KEY } from './auth.constants';

/** Explicitly opts a controller or handler out of the default auth boundary. */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE_KEY, true);
