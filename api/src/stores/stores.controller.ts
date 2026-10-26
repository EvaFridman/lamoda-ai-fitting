import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/auth/access.decorators.js';
import { StoreResponseDto } from './dto/store-response.dto.js';
import { StoresService } from './stores.service.js';

// A public read in the read tier; no route writes stores, only the seed (spec 0022 X2).
@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  @Public()
  @ApiOkResponse({
    type: StoreResponseDto,
    isArray: true,
    description: "Every store in Lamoda's order, as a plain array (no paging).",
  })
  list(): Promise<StoreResponseDto[]> {
    return this.stores.list();
  }
}
