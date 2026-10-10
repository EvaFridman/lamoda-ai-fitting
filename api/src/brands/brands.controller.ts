import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AdminOnly } from '../common/guards/admin.guard.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
import { BrandsService } from './brands.service.js';
import { BrandResponseDto } from './dto/brand-response.dto.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

// Reads are public, writes need the admin token (spec 0004 E1).
@ApiTags('brands')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  @ApiPaginatedResponse(BrandResponseDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<BrandResponseDto>> {
    return this.brands.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: BrandResponseDto })
  get(@Param('id', UuidPipe) id: string): Promise<BrandResponseDto> {
    return this.brands.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: BrandResponseDto })
  create(@Body() dto: CreateBrandDto): Promise<BrandResponseDto> {
    return this.brands.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOkResponse({ type: BrandResponseDto })
  update(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandResponseDto> {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@Param('id', UuidPipe) id: string): Promise<void> {
    return this.brands.delete(id);
  }
}
