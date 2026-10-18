import { type ExecutionContext, Injectable } from '@nestjs/common';

import type { Access } from '../../src/common/auth/access.decorators.js';
import { AccessGuard } from '../../src/common/auth/access.guard.js';

// createTestApp()'s access guard: a @Closed() route lets a signed-in user through, as @SignedIn()
// does, so the tests reach the closed writes with signIn() (spec 0013 plan §4). @Public(), @SignedIn()
// and an unmarked route behave as in production. Only test apps have it.
@Injectable()
export class TestAccessGuard extends AccessGuard {
  protected override accessOf(context: ExecutionContext): Access | undefined {
    const access = super.accessOf(context);
    return access === 'closed' ? 'user' : access;
  }
}
