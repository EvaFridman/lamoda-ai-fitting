import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { HelloController } from './hello.controller.js';
import { HelloService } from './hello.service.js';

describe('HelloController', () => {
  it('returns the greeting from the service', async () => {
    // Built through Nest's DI, so the test also proves decorator metadata is emitted.
    const moduleRef = await Test.createTestingModule({
      controllers: [HelloController],
      providers: [HelloService],
    }).compile();

    expect(moduleRef.get(HelloController).get()).toEqual({ message: 'Hello, wrong!' });
  });
});
