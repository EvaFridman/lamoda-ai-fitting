import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ApiErrors } from '../common/errors/api-errors.decorator.js';
import { Closed, Public } from '../common/auth/access.decorators.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { BrandsService } from './brands.service.js';
import { BrandResponseDto } from './dto/brand-response.dto.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

// Reads are public, writes are closed to everyone (spec 0013 N8).
@ApiTags('brands')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @Public()
  @ApiPaginatedResponse(BrandResponseDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<BrandResponseDto>> {
    return this.brands.list(query);
  }

  @Get(':id')
  @Public()
  @ApiOkResponse({ type: BrandResponseDto })
  get(@UuidParam('id') id: string): Promise<BrandResponseDto> {
    return this.brands.get(id);
  }

  @Post()
  @Closed()
  @ApiCreatedResponse({ type: BrandResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  create(@Body() dto: CreateBrandDto): Promise<BrandResponseDto> {
    return this.brands.create(dto);
  }

  @Patch(':id')
  @Closed()
  @ApiOkResponse({ type: BrandResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  update(@UuidParam('id') id: string, @Body() dto: UpdateBrandDto): Promise<BrandResponseDto> {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @Closed()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrors('IN_USE')
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.brands.delete(id);
  }
}
