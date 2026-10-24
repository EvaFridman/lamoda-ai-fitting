import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SignedIn } from '../common/auth/access.decorators.js';
import { CurrentUserId } from '../common/auth/current-principal.decorator.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { FittingDto } from './dto/fitting.dto.js';
import { FittingsService } from './fittings.service.js';

// The signed-in user's fittings of one product, for the product page (spec 0019 plan §5).
@ApiTags('fittings')
@Controller('products/:id/fittings')
@SignedIn()
export class ProductFittingsController {
  constructor(private readonly fittings: FittingsService) {}

  @Get('last')
  @ApiOperation({
    description:
      "The user's newest completed fitting that holds the product, regenerations included; " +
      '404 when there is none.',
  })
  @ApiOkResponse({ type: FittingDto })
  last(@CurrentUserId() userId: string, @UuidParam('id') id: string): Promise<FittingDto> {
    return this.fittings.lastOfProduct(userId, id);
  }
}
