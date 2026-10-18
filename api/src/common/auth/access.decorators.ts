import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiCookieAuth, ApiExtension } from '@nestjs/swagger';

// The Swagger security scheme (swagger.ts) that routes under @SignedIn() refer to: the session
// cookie Better Auth sets.
export const SESSION_SECURITY = 'session';
// The operation extension @Closed() writes and swagger.ts reads (a 401 for everyone), then removes.
export const CLOSED_EXTENSION = 'x-closed';

// Who may call a route; AccessGuard reads it. A marker on a route overrides one on its controller.
export type Access = 'public' | 'user' | 'closed';
export const ACCESS_METADATA = 'access';

// On a controller or a route: anyone may call it, with a broken or expired session cookie too.
export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(ACCESS_METADATA, 'public' satisfies Access);
}

// On a controller or a route: needs a signed-in user (spec 0013 N8); Swagger shows the route as
// secured by the session cookie.
export function SignedIn(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(ACCESS_METADATA, 'user' satisfies Access),
    ApiCookieAuth(SESSION_SECURITY),
  );
}

// On a controller or a route: no one may call it, a signed-in user neither (N8): catalog writes,
// the routes of other users, writing generations. It stays in the code for the tests, which reach
// it through createTestApp()'s guard, and for a later spec that opens it.
export function Closed(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(ACCESS_METADATA, 'closed' satisfies Access),
    ApiExtension(CLOSED_EXTENSION, true),
  );
}
