import { Controller, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AI_SETTINGS, type AiSettings } from '../../ai/ai-settings.js';
import { SignedIn } from '../../common/auth/access.decorators.js';
import { CurrentUserId } from '../../common/auth/current-principal.decorator.js';
import { ApiErrors } from '../../common/errors/api-errors.decorator.js';
import { Expensive } from '../../throttling/tiered-throttler.guard.js';
import { MeService } from '../me.service.js';
import { signOutWhenGone } from '../sign-out-when-gone.js';
import { UserPhotoDto } from './dto/user-photo.dto.js';
import { MePhotosService } from './me-photos.service.js';
import { PHOTO_FIELD, readPhotoUpload, SAVE_FIELD } from './photo-upload.js';

// The signed-in user's fitting photos (spec 0019 plan §5). As /me, a deleted user's cached
// session gets 401 with the session cookies expired (spec 0013 N31, N38).
@ApiTags('me')
@Controller('me/photos')
@SignedIn()
export class MePhotosController {
  constructor(
    private readonly photos: MePhotosService,
    private readonly me: MeService,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}

  // The upload is multipart, read here by busboy (photo-upload.ts), not by a body parser, so the
  // handler sees the raw stream. A photo check that does not answer in time is 503 with nothing
  // stored (A45).
  @Post()
  @Expensive()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [PHOTO_FIELD],
      properties: {
        [PHOTO_FIELD]: {
          type: 'string',
          format: 'binary',
          description:
            'A JPG, PNG or WebP of at most FITTING_PHOTO_MAX_BYTES (20 MB); stored as WebP of at most 2048 px without metadata.',
        },
        [SAVE_FIELD]: {
          type: 'boolean',
          default: true,
          description:
            '`false` stores a one-time photo: not among the saved ones (at most 5), deleted with its generation or after an hour unused.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: UserPhotoDto })
  @ApiErrors('LIMIT_REACHED')
  upload(
    @CurrentUserId() userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserPhotoDto> {
    return signOutWhenGone(
      res,
      () => this.me.sessionCookies(),
      async () =>
        this.photos.upload(userId, await readPhotoUpload(req, this.settings.photoMaxBytes)),
    );
  }
}
