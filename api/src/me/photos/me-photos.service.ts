import { Inject, Injectable, Logger } from '@nestjs/common';

import { AiProviderError } from '../../ai/ai-provider.error.js';
import { AI_PROVIDER, type AiProvider } from '../../ai/ai-provider.js';
import type { PhotoCheck } from '../../ai/checks/photo-checker.js';
import { refusalMessage } from '../../ai/refusal-message.js';
import { AppException, ValidationError } from '../../common/errors/app.exception.js';
import type { Prisma, UserPhoto } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { userPhotoKey } from '../../storage/keys.js';
import { ownedLink } from '../../storage/owner-check.js';
import { StorageError } from '../../storage/storage.error.js';
import { StorageService } from '../../storage/storage.service.js';
import { RUNNING_STATUSES } from '../../fittings/end-fitting.js';
import { FileDeletion } from '../../temporal/file-deletion.js';
import { lockUser } from '../lock-user.js';
import { userGone } from '../me.service.js';
import { consentRequired, hasConsent } from './consent.js';
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
    private readonly fileDeletion: FileDeletion,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  // The saved photos (not the transient ones, A24), in the order they were uploaded, at most
  // MAX_SAVED_PHOTOS: a plain array, not Paginated<T> (plan §5). A gone user has none (spec 0013
  // N31: a read finds nothing).
  async list(userId: string): Promise<UserPhotoDto[]> {
    const rows = await this.prisma.userPhoto.findMany({
      where: { userId, transient: false },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  // Makes one saved photo the default (AC3), the earlier default no longer. The user's row is
  // locked, as in the upload, so two changes at once cannot both pass the one-default index (and a
  // gone user is 401); another user's, a transient or a missing photo is 404 (P2025, spec 0013
  // N8).
  async setDefault(userId: string, id: string): Promise<UserPhotoDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await tx.userPhoto.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
      return tx.userPhoto.update({
        where: { id, userId, transient: false },
        data: { isDefault: true },
      });
    });
    return this.toResponse(row);
  }

  // Keeps a transient photo for later try-ons (spec 0024 plan §3.1, Z12): the result's switch,
  // on as the result opens. With the user's row locked, as the upload, the housekeeping and the
  // window's close, the count is final and no deletion of the photo runs meanwhile. A photo saved
  // already answers unchanged (Z29: never saved twice, so not counted); with no default photo it
  // becomes the default (the upload's rule, A54). Another user's or a missing photo is 404.
  async keep(userId: string, id: string): Promise<UserPhotoDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const photo = await tx.userPhoto.findUniqueOrThrow({ where: { id, userId } });
      if (!photo.transient) {
        return photo;
      }
      if ((await this.savedCount(tx, userId)) >= MAX_SAVED_PHOTOS) {
        throw limitReached();
      }
      const isDefault = (await tx.userPhoto.count({ where: { userId, isDefault: true } })) === 0;
      return tx.userPhoto.update({ where: { id }, data: { transient: false, isDefault } });
    });
    return this.toResponse(row);
  }

  // The switch turned off (Z26.4): a saved photo of the user is transient again, no longer the
  // default, and goes as any transient one (the window's close, the housekeeping), so the switch
  // can keep it again while the result is open. No other photo becomes the default (as a delete,
  // A54). A transient, another user's or a missing photo is 404 (P2025).
  async unkeep(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await tx.userPhoto.update({
        where: { id, userId, transient: false },
        data: { transient: true, isDefault: false },
      });
    });
  }

  // Deletes one saved photo: the row and its outbox entry in one transaction (spec 0019 A38), the
  // file after the commit. No other photo becomes the default: the next saved upload does (A54).
  // Another user's, a transient or a missing photo is 404 (P2025).
  async delete(userId: string, id: string): Promise<void> {
    const queued = await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const photo = await tx.userPhoto.delete({
        where: { id, userId, transient: false },
        select: { id: true, imageKey: true },
      });
      return this.fileDeletion.enqueue(tx, 'photo', photo.id, [photo.imageKey]);
    });
    await this.fileDeletion.start(queued);
  }

  // Closing the try-on (A69, A70): deletes a transient photo of the user, the row and its outbox
  // entry in one transaction, the file after the commit. A photo a running generation uses stays
  // for the housekeeping (a window closed during the wait loses nothing, AC10), and the answer is
  // the same 204. A saved, someone else's or a missing photo is 404 (P2025).
  async deleteTransient(userId: string, id: string): Promise<void> {
    const queued = await this.prisma.$transaction(async (tx) => {
      // As the housekeeping (A69): with the user locked, no start can begin to use it meanwhile.
      await lockUser(tx, userId);
      const photo = await tx.userPhoto.findUniqueOrThrow({
        where: { id, userId, transient: true },
        select: { id: true, imageKey: true },
      });
      const running = await tx.aiGeneration.count({
        where: { photoId: photo.id, userId, status: { in: [...RUNNING_STATUSES] } },
      });
      if (running > 0) {
        return null;
      }
      await tx.userPhoto.delete({ where: { id: photo.id } });
      return this.fileDeletion.enqueue(tx, 'photo', photo.id, [photo.imageKey]);
    });
    await this.fileDeletion.start(queued);
  }

  // In this order, so a refused upload costs as little as it can (A54): the user's row, the
  // consents (spec 0023 Y17) and the limit (reads, before any model call), sharp, the consents'
  // write (its own statement, so a photo the check refuses keeps them, plan §3.1), the check, then
  // the object and the row in one
  // transaction with the user's row locked (A31: the count is final there). The object is written
  // inside the transaction under its own time limit, so a write that fails or runs past the
  // transaction's time leaves no row and, aborted, no object; a row that fails after the write (a
  // database rule) leaves an object the user's folder deletion clears (M7).
  async upload(userId: string, upload: PhotoUpload): Promise<UserPhotoDto> {
    // A deleted user's cached session may still pass for 5 minutes (spec 0013 N31): 401 here,
    // before a paid check; the lock in the transaction is the final word.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { photoConsentVersion: true },
    });
    if (user === null) {
      throw userGone();
    }
    const consentStored = hasConsent(user.photoConsentVersion);
    if (!consentStored && upload.consent === null) {
      throw new ValidationError([consentRequired()]);
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
    if (!consentStored && upload.consent !== null) {
      await this.recordConsent(userId, upload.consent);
    }
    const check = await this.check(photo);
    if (!check.ok) {
      throw new ValidationError([
        {
          field: PHOTO_FIELD,
          code: 'PHOTO_REFUSED',
          // The reason in its code form (plan §5): web picks the screen by it.
          message: refusalMessage(PHOTO_FIELD, check.reason),
        },
      ]);
    }
    const key = userPhotoKey(userId);
    const row = await this.prisma.$transaction(async (tx) => {
      // The lock holds the count below until the commit.
      await lockUser(tx, userId);
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

  // Only over a lower or no version, so a second upload racing the first does not move the time;
  // a user deleted meanwhile updates nothing, and the transaction's lock answers 401.
  private async recordConsent(userId: string, version: number): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ photoConsentVersion: null }, { photoConsentVersion: { lt: version } }],
      },
      data: { photoConsentAt: new Date(), photoConsentVersion: version },
    });
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
