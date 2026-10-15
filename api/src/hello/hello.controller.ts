import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/auth/access.decorators.js';
import { HelloResponseDto } from './hello-response.dto.js';
import { HelloService } from './hello.service.js';

@Public()
@ApiTags('hello')
@Controller('hello')
export class HelloController {
  constructor(private readonly hello: HelloService) {}

  @Get()
  @ApiOkResponse({ type: HelloResponseDto })
  get(): HelloResponseDto {
    return { message: this.hello.getGreeting() };
  }
}
