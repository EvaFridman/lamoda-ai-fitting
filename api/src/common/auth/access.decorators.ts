import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export { ADMIN_TOKEN_HEADER } from '../http/request-context.js';
// The Swagger security scheme (swagger.ts) that routes under @AdminOnly() refer to.
export const ADMIN_SECURITY = 'admin';

// Who may call a route; AccessGuard reads it. A marker on a route overrides one on its controller.
export type Access = 'public' | 'admin';
export const ACCESS_METADATA = 'access';

// On a controller or a route: anyone may call it, whatever X-Admin-Token says (spec 0006 F16).
export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(ACCESS_METADATA, 'public' satisfies Access);
}

// On a controller or a route: needs the admin token; Swagger shows the route as secured.
export function AdminOnly(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(ACCESS_METADATA, 'admin' satisfies Access),
    ApiSecurity(ADMIN_SECURITY),
  );
}
