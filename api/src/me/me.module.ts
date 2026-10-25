import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { UsersModule } from '../users/users.module.js';
import { FittingRoomController } from './fitting-room/fitting-room.controller.js';
import { FittingRoomService } from './fitting-room/fitting-room.service.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { MePhotosController } from './photos/me-photos.controller.js';
import { MePhotosService } from './photos/me-photos.service.js';

// The signed-in user's own data (spec 0013, 0017), fitting photos (spec 0019 plan §5: the photo
// check through AiModule, the bucket through StorageModule) and fitting room (A12).
@Module({
  imports: [AuthModule, UsersModule, StorageModule, AiModule],
  controllers: [MeController, MePhotosController, FittingRoomController],
  providers: [MeService, MePhotosService, FittingRoomService],
  // The session cookies of a gone user's sign-out, for the fittings' writes (spec 0019 plan §5).
  exports: [MeService],
})
export class MeModule {}
