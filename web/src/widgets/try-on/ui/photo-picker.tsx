'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { LimitMeter, type FittingQuota, type StartedFitting } from '@/entities/fitting';
import type { ProductDetail } from '@/entities/product';
import { PhotoThumb, type UserPhoto } from '@/entities/user-photo';
import { showStubToast } from '@/features/product-stubs';
import { StartFittingButton } from '@/features/start-fitting';
import type { TryColour } from '@/features/try-colour';
import { UploadPhoto } from '@/features/upload-photo';
import { useTrackedElement } from '@/shared/analytics';
import { Button, Link, LockIcon, Notice, Skeleton, Spinner, Switch } from '@/shared/ui';

import { ItemRow } from './item-row';

import styles from './photo-picker.module.scss';

// At most five saved photos (spec 0019 A31): past them a new photo is a one-time one.
const MAX_SAVED_PHOTOS = 5;

// A saved photo of the strip: choosing it, its click and hover tracked with whether it is the
// default.
function StripThumb({
  photo,
  position,
  chosen,
  onChoose,
}: {
  photo: UserPhoto;
  position: number;
  chosen: boolean;
  onChoose: () => void;
}) {
  const tracked = useTrackedElement('try-on.photo', { is_default: photo.isDefault });
  return (
    <button
      type="button"
      className={styles.thumb}
      aria-pressed={chosen}
      aria-label={photo.isDefault ? `Фото ${position}, по умолчанию` : `Фото ${position}`}
      onClick={() => {
        tracked.onClick();
        onChoose();
      }}
      onPointerEnter={tracked.onPointerEnter}
      onPointerLeave={tracked.onPointerLeave}
    >
      <PhotoThumb photo={photo} alt="" className={styles.thumbImage} />
    </button>
  );
}

// The chosen file while it uploads (board 3.3), from an object URL put on the image by an effect
// and revoked when it goes, as `RefusedPreview` does.
function PendingPhoto({ file }: { file: File }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  return (
    <>
      {/* A local object URL: Next's image component would add nothing to it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} className={styles.dimmed} alt="" />
      <span className={styles.uploading}>
        <Spinner size={64} />
        Загружаем и проверяем фото…
      </span>
    </>
  );
}

export interface PhotoPickerProps {
  product: ProductDetail | undefined;
  // The colour tried on: the product's first one (A76), none for a product without colours.
  colour: TryColour | undefined;
  photos: UserPhoto[] | undefined;
  photosFailed: boolean;
  // A one-time photo uploaded here, not among the saved ones.
  transient: UserPhoto | null;
  onTransient: (photo: UserPhoto) => void;
  // The chosen photo's id: the default one until another is chosen (A63.4).
  chosenId: string | null;
  onChoose: (id: string) => void;
  quota: FittingQuota | undefined;
  onStarted: (fitting: StartedFitting) => void;
  onLimit: () => void;
}

// Board 3, the photo picker (spec 0019 AC3, AC5, AC6, A62): the chosen photo with «Видите только
// вы», the item, the strip of saved photos (the default marked) closed by the upload's tiles, the
// switch «Сохранить фото для следующих примерок» for a new photo, the month's meter and
// «Примерить». A new photo shows dimmed while it uploads (3.3) and is chosen once stored; a refusal
// opens board 5 with the note that the try-on was not spent.
export function PhotoPicker({
  product,
  colour,
  photos,
  photosFailed,
  transient,
  onTransient,
  chosenId,
  onChoose,
  quota,
  onStarted,
  onLimit,
}: PhotoPickerProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const saved = photos ?? [];
  const full = saved.length >= MAX_SAVED_PHOTOS;
  const [saveChoice, setSaveChoice] = useState(true);
  const save = saveChoice && !full;
  const chosen =
    (transient && transient.id === chosenId ? transient : undefined) ??
    saved.find((photo) => photo.id === chosenId);
  const left = quota?.left;

  const thumbs = (
    <>
      {saved.map((photo, index) => (
        <StripThumb
          key={photo.id}
          photo={photo}
          position={index + 1}
          chosen={photo.id === chosenId}
          onChoose={() => onChoose(photo.id)}
        />
      ))}
      {transient && (
        <StripThumb
          photo={transient}
          position={saved.length + 1}
          chosen={transient.id === chosenId}
          onChoose={() => onChoose(transient.id)}
        />
      )}
    </>
  );

  return (
    <div className={styles.picker}>
      <div className={['mp-block', styles.photo].join(' ')}>
        {pendingFile ? (
          <PendingPhoto file={pendingFile} />
        ) : chosen?.url ? (
          <Image className={styles.image} src={chosen.url} alt="Ваше фото" fill unoptimized />
        ) : photos === undefined && !photosFailed ? (
          <Skeleton height="100%" />
        ) : (
          <span className={styles.empty}>Загрузите фото в полный рост: один человек в кадре</span>
        )}
        {chosen && !pendingFile && (
          <span className={styles.private}>
            <LockIcon size={16} />
            Видите только вы
          </span>
        )}
      </div>

      <div className={styles.item}>
        {product ? (
          <ItemRow
            name={product.name}
            imageUrl={product.image?.url ?? null}
            details={colour?.value}
            price={product.price}
            finalPrice={product.finalPrice}
            action={
              <Button variant="outline" size={32} textSize="body-s" onClick={showStubToast}>
                В корзину
              </Button>
            }
          />
        ) : (
          <Skeleton height={80} />
        )}
      </div>

      <div className={styles.photos}>
        <div className={styles.photosHead}>
          <span>Ваши фото</span>
          <Link href="/customer/photos" variant="secondary">
            Управлять
          </Link>
        </div>
        {photosFailed && (
          <Notice tone="error" role="alert">
            Не удалось загрузить ваши фото. Обновите страницу.
          </Notice>
        )}
        <UploadPhoto
          place="try-on"
          appearance="strip"
          thumbs={thumbs}
          save={save}
          refusalNote={
            left === undefined ? undefined : (
              <Notice tone="success">Примерка не списана · осталось {left}</Notice>
            )
          }
          onPendingChange={setPendingFile}
          onUploaded={(photo) => {
            if (photo.transient) onTransient(photo);
            onChoose(photo.id);
          }}
        />
      </div>

      <div className={styles.save}>
        <Switch
          checked={save}
          disabled={full}
          onCheckedChange={(checked) => setSaveChoice(checked)}
        >
          Сохранить фото для следующих примерок
        </Switch>
        <p className={styles.caption}>
          {full
            ? `Сохранено ${MAX_SAVED_PHOTOS} фото из ${MAX_SAVED_PHOTOS}: новое фото используется один раз и удалится после примерки.`
            : save
              ? 'Касается нового фото. Выключите — фото используется один раз и удалится после примерки.'
              : 'Выключено: фото используется один раз и удалится после примерки. Результат останется в истории.'}
        </p>
      </div>

      <div className={styles.footer}>
        {startError && (
          <Notice tone="error" role="alert">
            {startError}
          </Notice>
        )}
        {quota && <LimitMeter left={quota.left} limit={quota.limit} className={styles.meter} />}
        {product && (
          <StartFittingButton
            photoId={chosen && !pendingFile ? chosen.id : null}
            productId={product.id}
            attributeValueId={colour?.id}
            onStarted={onStarted}
            onLimit={onLimit}
            onError={setStartError}
          />
        )}
        <p className={styles.caption}>
          Фото не используются для обучения моделей ·{' '}
          <Link href="/privacy" variant="secondary" target="_blank">
            Как мы храним фото
          </Link>
        </p>
      </div>
    </div>
  );
}
