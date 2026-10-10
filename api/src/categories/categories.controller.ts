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
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
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
  @ApiPaginatedResponse(CategoryResponseDto)
  list(@Query() query: ListCategoriesQueryDto): Promise<Paginated<CategoryResponseDto>> {
    return this.categories.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: CategoryResponseDto })
  get(@Param('id', UuidPipe) id: string): Promise<CategoryResponseDto> {
    return this.categories.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiCreatedResponse({ type: CategoryResponseDto })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOkResponse({ type: CategoryResponseDto })
  update(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@Param('id', UuidPipe) id: string): Promise<void> {
    return this.categories.delete(id);
  }
}
