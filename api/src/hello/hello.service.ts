import { Injectable } from '@nestjs/common';

import { GREETING } from './greeting.js';

@Injectable()
export class HelloService {
  getGreeting(): string {
    return GREETING;
  }
}
