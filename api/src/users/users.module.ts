import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  // For /me (MeModule).
  exports: [UsersService],
})
export class UsersModule {}
