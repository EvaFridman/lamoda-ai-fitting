import { Injectable } from '@nestjs/common';

@Injectable()
export class HelloService {
  getGreeting(): string {
    return 'Hello, world!';
  }
}
