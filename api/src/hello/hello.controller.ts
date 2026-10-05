import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { HelloResponseDto } from './hello-response.dto.js';
import { HelloService } from './hello.service.js';

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
