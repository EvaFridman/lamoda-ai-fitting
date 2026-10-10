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

import { AdminOnly } from '../common/guards/admin.guard.js';
import { ApiPaginatedResponse, type Paginated } from '../common/pagination/paginated.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { UuidParam } from '../common/pipes/uuid.pipe.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

// Every route, reads included, needs the admin token (spec 0004 E1).
@ApiTags('users')
@Controller('users')
@AdminOnly()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiPaginatedResponse(UserResponseDto)
  list(@Query() query: PaginationQueryDto): Promise<Paginated<UserResponseDto>> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponseDto })
  get(@UuidParam('id') id: string): Promise<UserResponseDto> {
    return this.users.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UserResponseDto })
  update(@UuidParam('id') id: string, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(@UuidParam('id') id: string): Promise<void> {
    return this.users.delete(id);
  }
}
