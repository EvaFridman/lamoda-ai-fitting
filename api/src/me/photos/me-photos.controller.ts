import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AI_SETTINGS, type AiSettings } from '../../ai/ai-settings.js';
import { SignedIn } from '../../common/auth/access.decorators.js';
import { CurrentUserId } from '../../common/auth/current-principal.decorator.js';
import { ApiErrors } from '../../common/errors/api-errors.decorator.js';
import { UuidParam } from '../../common/pipes/uuid.pipe.js';
import { Expensive } from '../../throttling/tiered-throttler.guard.js';
import { MeService } from '../me.service.js';
import { signOutWhenGone } from '../sign-out-when-gone.js';
import { SetDefaultPhotoDto } from './dto/set-default-photo.dto.js';
import { UserPhotoDto } from './dto/user-photo.dto.js';
import { MePhotosService } from './me-photos.service.js';
import { PHOTO_FIELD, readPhotoUpload, SAVE_FIELD } from './photo-upload.js';

// The signed-in user's fitting photos (spec 0019 plan §5). As /me, a deleted user's cached
// session gets 401 with the session cookies expired on every write (spec 0013 N31, N38); the list
// is then empty.
@ApiTags('me')
@Controller('me/photos')
@SignedIn()
export class MePhotosController {
  constructor(
    private readonly photos: MePhotosService,
    private readonly me: MeService,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}

  @Get()
  @ApiOkResponse({
    type: UserPhotoDto,
    isArray: true,
    description: 'The saved photos (at most 5), oldest first; one-time photos are not listed.',
  })
  list(@CurrentUserId() userId: string): Promise<UserPhotoDto[]> {
    return this.photos.list(userId);
  }

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
            '`false` stores a one-time photo: not among the saved ones (at most 5), deleted when the try-on closes or an hour after its last fitting (unused, after its upload).',
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

  // Closing the try-on (spec 0019 A69, A70): deletes a one-time photo; one a running fitting uses
  // stays for the housekeeping. Saved photos and other users' are 404. Declared before `:id`.
  @Delete('transient/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'The one-time photo and its file are gone, or it stays while a running fitting uses it (deleted within an hour of its end).',
  })
  deleteTransient(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return signOutWhenGone(
      res,
      () => this.me.sessionCookies(),
      () => this.photos.deleteTransient(userId, id),
    );
  }

  // Makes a saved photo the default (AC3); one-time photos and other users' are 404.
  @Patch(':id')
  @ApiOkResponse({ type: UserPhotoDto })
  setDefault(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
    // Validated only: the body says `isDefault: true` and nothing else, the one change there is.
    @Body() _dto: SetDefaultPhotoDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserPhotoDto> {
    return signOutWhenGone(
      res,
      () => this.me.sessionCookies(),
      () => this.photos.setDefault(userId, id),
    );
  }

  // Deletes a saved photo and its file (through the outbox, A38); the results made with it stay
  // (A24). No other photo becomes the default (A54).
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The photo and its file are gone; its link answers 404.' })
  delete(
    @CurrentUserId() userId: string,
    @UuidParam('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return signOutWhenGone(
      res,
      () => this.me.sessionCookies(),
      () => this.photos.delete(userId, id),
    );
  }
}
