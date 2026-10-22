import { Inject, Injectable, Logger } from '@nestjs/common';

import { AiProviderError } from '../../ai/ai-provider.error.js';
import { AI_PROVIDER, type AiProvider } from '../../ai/ai-provider.js';
import type { PhotoCheck } from '../../ai/checks/photo-checker.js';
import { AppException, ValidationError } from '../../common/errors/app.exception.js';
import type { Prisma, UserPhoto } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { userPhotoKey } from '../../storage/keys.js';
import { ownedLink } from '../../storage/owner-check.js';
import { StorageError } from '../../storage/storage.error.js';
import { StorageService } from '../../storage/storage.service.js';
import { userGone } from '../me.service.js';
import type { UserPhotoDto } from './dto/user-photo.dto.js';
import { type FittingPhoto, NotAnImageError, toFittingPhoto } from './photo-image.js';
import { notAnImage, PHOTO_FIELD, type PhotoUpload } from './photo-upload.js';

// Saved photos per user (A31); a one-time photo (A24) is not counted.
export const MAX_SAVED_PHOTOS = 5;

// The bucket write runs inside the upload's transaction (A54), whose time is the statement
// timeout (5 s): the write is aborted before it, so a slow bucket cannot leave an object the
// rolled-back row never named, and the two counts and the insert keep the rest.
export const PUT_TIMEOUT_MS = 3000;

// The bucket did not take the photo (a failed request, or the time above passed): a 503 with
// nothing stored, reported by AppExceptionFilter as an outage.
export class StorageUnavailableError extends AppException {
  constructor(cause: StorageError) {
    super('SERVICE_UNAVAILABLE', 'The storage is unavailable, try again later');
    this.cause = cause;
  }
}

// The photo check (A45) did not answer: its deadline passed, or OpenAI is down or refused the
// call. A 503 with nothing stored, so the user retries; AppExceptionFilter reports it as an outage
// (once per route and minute).
export class PhotoCheckUnavailableError extends AppException {
  constructor(cause: AiProviderError) {
    super(
      'SERVICE_UNAVAILABLE',
      cause.isTimeout
        ? 'The photo check did not answer in time, try again'
        : 'The photo check is unavailable, try again later',
    );
    this.cause = cause;
  }
}

// The fitting photos of the signed-in user (spec 0019 plan §5). The server names every key
// (userPhotoKey, spec 0011 M7); a response carries a signed link (M9, M25).
@Injectable()
export class MePhotosService {
  private readonly logger = new Logger(MePhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  // In this order, so a refused upload costs as little as it can (A54): the user's row and the
  // limit (reads, before any model call), sharp, the check, then the object and the row in one
  // transaction with the user's row locked (A31: the count is final there). The object is written
  // inside the transaction under its own time limit, so a write that fails or runs past the
  // transaction's time leaves no row and, aborted, no object; a row that fails after the write (a
  // database rule) leaves an object the user's folder deletion clears (M7).
  async upload(userId: string, upload: PhotoUpload): Promise<UserPhotoDto> {
    // A deleted user's cached session may still pass for 5 minutes (spec 0013 N31): 401 here,
    // before a paid check; the lock in the transaction is the final word.
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (user === null) {
      throw userGone();
    }
    if (upload.save && (await this.savedCount(this.prisma, userId)) >= MAX_SAVED_PHOTOS) {
      throw limitReached();
    }
    let photo: FittingPhoto;
    try {
      photo = await toFittingPhoto(upload.photo);
    } catch (error) {
      if (!(error instanceof NotAnImageError)) throw error;
      // sharp's message names the problem (an unsupported format, a corrupt header, the pixel
      // limit) and holds no bytes; a failure of sharp itself shows here too.
      this.logger.warn(`Upload refused as not an image: ${error.message}`);
      throw new ValidationError([notAnImage()]);
    }
    const check = await this.check(photo);
    if (!check.ok) {
      throw new ValidationError([
        {
          field: PHOTO_FIELD,
          code: 'PHOTO_REFUSED',
          // The reason in its code form (plan §5): web picks the screen by it.
          message: `${PHOTO_FIELD} was refused: ${check.reason}`,
        },
      ]);
    }
    const key = userPhotoKey(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      // A deleted user's cached session may still pass (spec 0013 N31): no row is 401, and the
      // lock holds the count below until the commit.
      const owner = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (owner.length === 0) {
        throw userGone();
      }
      let isDefault = false;
      if (upload.save) {
        if ((await this.savedCount(tx, userId)) >= MAX_SAVED_PHOTOS) {
          throw limitReached();
        }
        // The first saved photo is the default (A31); after it was deleted, the next saved one.
        isDefault = (await tx.userPhoto.count({ where: { userId, isDefault: true } })) === 0;
      }
      try {
        await this.storage.put(key, photo.webp, {
          contentType: 'image/webp',
          ownerUserId: userId,
          abortSignal: AbortSignal.timeout(PUT_TIMEOUT_MS),
        });
      } catch (error) {
        if (error instanceof StorageError) throw new StorageUnavailableError(error);
        throw error;
      }
      return tx.userPhoto.create({
        data: {
          userId,
          imageKey: key,
          isDefault,
          transient: !upload.save,
          width: photo.width,
          height: photo.height,
        },
      });
    });
    return this.toResponse(row);
  }

  private savedCount(client: Prisma.TransactionClient, userId: string): Promise<number> {
    return client.userPhoto.count({ where: { userId, transient: false } });
  }

  // On the stored WebP (plan §5), far smaller than the upload: a data URL of it goes to the vision
  // model.
  private async check(photo: FittingPhoto): Promise<PhotoCheck> {
    try {
      return await this.ai.checkPhoto({ bytes: photo.webp, mimeType: 'image/webp' });
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw new PhotoCheckUnavailableError(error);
      }
      throw error;
    }
  }

  private async toResponse(row: UserPhoto): Promise<UserPhotoDto> {
    return {
      id: row.id,
      url: await ownedLink(this.storage, this.logger, {
        rowId: row.id,
        field: 'imageKey',
        key: row.imageKey,
        ownerId: row.userId,
      }),
      isDefault: row.isDefault,
      transient: row.transient,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt,
    };
  }
}

function limitReached(): AppException {
  return new AppException(
    'LIMIT_REACHED',
    `At most ${MAX_SAVED_PHOTOS} saved photos; delete one to add another`,
  );
}
