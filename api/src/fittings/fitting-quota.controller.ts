import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { SignedIn } from '../common/auth/access.decorators.js';
import { CurrentUserId } from '../common/auth/current-principal.decorator.js';
import { FittingQuotaDto } from './dto/fitting-quota.dto.js';
import { FittingQuotaService } from './fitting-quota.service.js';

// The signed-in user's try-ons of the month (spec 0019 A20): the counter and the limit meter.
@ApiTags('me')
@Controller('me/fitting-quota')
@SignedIn()
export class FittingQuotaController {
  constructor(private readonly quota: FittingQuotaService) {}

  @Get()
  @ApiOkResponse({ type: FittingQuotaDto })
  get(@CurrentUserId() userId: string): Promise<FittingQuotaDto> {
    return this.quota.read(userId);
  }
}
