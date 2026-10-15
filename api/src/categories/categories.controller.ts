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
import { AdminOnly, Public } from '../common/auth/access.decorators.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { CategoriesService } from './categories.service.js';
import { CategoryResponseDto } from './dto/category-response.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

// Reads are public, writes need the admin token (spec 0004 E1).
@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Public()
  @ApiPaginatedResponse(CategoryResponseDto)
  list(@Query() query: ListCategoriesQueryDto): Promise<Paginated<CategoryResponseDto>> {
    return this.categories.list(query);
  }

  @Get(':id')
  @Public()
  @ApiOkResponse({ type: CategoryResponseDto })
  get(@UuidParam('id') id: string): Promise<CategoryResponseDto> {
    return this.categories.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiErrors('ALREADY_EXISTS')
  update(
    @UuidParam('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrors('IN_USE')
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.categories.delete(id);
  }
}
