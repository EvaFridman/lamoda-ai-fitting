import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { UsersModule } from '../users/users.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { MePhotosController } from './photos/me-photos.controller.js';
import { MePhotosService } from './photos/me-photos.service.js';

// The signed-in user's own data (spec 0013, 0017) and fitting photos (spec 0019 plan §5: the
// photo check through AiModule, the bucket through StorageModule).
@Module({
  imports: [AuthModule, UsersModule, StorageModule, AiModule],
  controllers: [MeController, MePhotosController],
  providers: [MeService, MePhotosService],
  // The session cookies of a gone user's sign-out, for the fittings' writes (spec 0019 plan §5).
  exports: [MeService],
})
export class MeModule {}
