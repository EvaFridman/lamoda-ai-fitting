import { Inject, Injectable } from '@nestjs/common';

import { AI_SETTINGS, type AiSettings } from '../ai/ai-settings.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FittingQuotaDto } from './dto/fitting-quota.dto.js';
import { quotaMonth, quotaRenewsAt } from './quota-month.js';

// The month's spend of the fitting limit (spec 0019 A20, A26), kept in `fitting_quota` apart from
// the results: written here by the start transaction and taken back by `endFitting`.
@Injectable()
export class FittingQuotaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}

  // A user with no row this month has spent nothing; a gone user reads the same (spec 0013 N31).
  async read(userId: string, now = new Date()): Promise<FittingQuotaDto> {
    const row = await this.prisma.fittingQuota.findUnique({
      where: { userId_month: { userId, month: quotaMonth(now) } },
      select: { used: true },
    });
    const used = row?.used ?? 0;
    const limit = this.settings.monthlyLimit;
    return { limit, used, left: Math.max(limit - used, 0), renewsAt: quotaRenewsAt(now) };
  }

  // Before a paid text check (T12's security review): a user at the limit is refused without the
  // lock, so a stream of new texts costs no checks. `reserve` stays the final word.
  async assertLeft(userId: string, now = new Date()): Promise<void> {
    if ((await this.read(userId, now)).left === 0) {
      throw this.limitReached(now);
    }
  }

  // In the start transaction, with the user's row locked (A26): two starts cannot both pass the
  // limit. Spends one unit of the month of `at` (the generation's `createdAt`, as `endFitting`
  // gives it back), or refuses with 409 LIMIT_REACHED and the renewal date.
  async reserve(tx: Prisma.TransactionClient, userId: string, at: Date): Promise<void> {
    const month = quotaMonth(at);
    const limit = this.settings.monthlyLimit;
    const spent = await tx.fittingQuota.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, used: 0 },
      update: {},
      select: { used: true },
    });
    if (spent.used >= limit) {
      throw this.limitReached(at);
    }
    await tx.fittingQuota.update({
      where: { userId_month: { userId, month } },
      data: { used: { increment: 1 } },
    });
  }

  private limitReached(at: Date): AppException {
    return new AppException(
      'LIMIT_REACHED',
      `All ${this.settings.monthlyLimit} try-ons of the month are spent; the limit renews at ${quotaRenewsAt(at).toISOString()}`,
    );
  }
}
