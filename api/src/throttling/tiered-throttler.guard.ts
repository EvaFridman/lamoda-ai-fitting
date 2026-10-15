import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from '@nestjs/throttler';
// Not exported from the package root; the key @SkipThrottle() writes its metadata under.
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants.js';
import type { Request } from 'express';

// Quota tiers by the cost of a route (spec 0006 F6). Each tier has two named throttlers in
// ThrottlingModule: `<tier>-burst` (1 s) and `<tier>-minute` (60 s).
export const TIERS = ['read', 'write', 'expensive'] as const;
export type Tier = (typeof TIERS)[number];
export const WINDOWS = { burst: 1000, minute: 60_000 } as const;
export type Window = keyof typeof WINDOWS;

export function throttlerName(tier: Tier, window: Window): string {
  return `${tier}-${window}`;
}

const EXPENSIVE_METADATA = 'throttling:expensive';

// On a controller or a route that starts costly work (an AI generation, a photo upload): counted in
// the expensive tier, whatever the method. A per-route @Throttle() must name these throttlers
// (e.g. `expensive-minute`): one keyed `default`, as Nest's docs show, matches none and changes
// nothing.
export function Expensive(): MethodDecorator & ClassDecorator {
  return SetMetadata(EXPENSIVE_METADATA, true);
}

// The rate limit with tiers: a request counts only against the two throttlers of its route's tier
// (expensive with @Expensive(), else read for GET and HEAD, else write). Counters stay per route and
// client address, as ThrottlerGuard keys them (F22).
@Injectable()
export class TieredThrottlerGuard extends ThrottlerGuard {
  // ThrottlerGuard checks the throttlers by ascending window and stops at the first refusal. Longest
  // first instead, so a client over its minute quota is told in Retry-After how long that lasts, not
  // the burst's 1 s; a request the burst refuses counts against the minute too (spec 0006 F23).
  override async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    this.throttlers.reverse();
  }

  // @SkipThrottle() with no argument marks only the throttler named `default`, which no longer
  // exists: here it skips every tier, so health checks and the gateway stay unlimited.
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(
      this.reflector.getAllAndOverride<boolean | undefined>(`${THROTTLER_SKIP}default`, [
        context.getHandler(),
        context.getClass(),
      ]) === true,
    );
  }

  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, throttler } = requestProps;
    if (!throttler.name?.startsWith(`${this.tierOf(context)}-`)) {
      return Promise.resolve(true);
    }
    return super.handleRequest(requestProps);
  }

  // Named throttlers set only `Retry-After-<name>`; the standard header that clients read is set
  // here too, from the throttler that refused the request.
  protected override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    this.setResponseHeader(res, 'Retry-After', throttlerLimitDetail.timeToBlockExpire);
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }

  private tierOf(context: ExecutionContext): Tier {
    const expensive = this.reflector.getAllAndOverride<boolean | undefined>(EXPENSIVE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (expensive === true) return 'expensive';
    const { method } = context.switchToHttp().getRequest<Request>();
    return method === 'GET' || method === 'HEAD' ? 'read' : 'write';
  }
}
