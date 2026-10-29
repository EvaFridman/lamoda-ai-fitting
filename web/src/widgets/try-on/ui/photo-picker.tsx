'use client';

import Image from 'next/image';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { LimitMeter, type FittingQuota, PhotoFrame, triesLeftTail } from '@/entities/fitting';
import { PhotoThumb, type UserPhoto } from '@/entities/user-photo';
import { UploadPhoto } from '@/features/upload-photo';
import { useTrackedElement } from '@/shared/analytics';
import { Link, LockIcon, Notice, Skeleton, Spinner, Switch } from '@/shared/ui';

import styles from './photo-picker.module.scss';

// At most five saved photos (spec 0019 A31): past them a new photo is a one-time one.
const MAX_SAVED_PHOTOS = 5;

// A photo of «Заменить фото»'s window, never the chosen one: choosing it, its click and hover
// tracked with whether it is the default.
function StripThumb({
  photo,
  position,
  onChoose,
}: {
  photo: UserPhoto;
  position: number;
  onChoose: () => void;
}) {
  const tracked = useTrackedElement('try-on.photo', { is_default: photo.isDefault });
  return (
    <button
      type="button"
      className={styles.thumb}
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
  // What is tried on, beside the photo: the item (board 3.1) or the look's items (3.2).
  subject: ReactNode;
  // The start button for the chosen photo (null while none is ready), which says its failure.
  renderStart: (photoId: string | null, onError: (text: string | null) => void) => ReactNode;
  // The meter's text; left out, «Осталось N примерок в этом месяце».
  meterText?: (left: number) => string;
  photos: UserPhoto[] | undefined;
  photosFailed: boolean;
  // A one-time photo uploaded here, not among the saved ones.
  transient: UserPhoto | null;
  onTransient: (photo: UserPhoto) => void;
  // The chosen photo's id: the default one until another is chosen (A63.4); null none (no photos
  // yet, or none after «Примерить на другом фото», spec 0024 AC17).
  chosenId: string | null;
  onChoose: (id: string) => void;
  quota: FittingQuota | undefined;
}

// Board 3, the photo picker (spec 0019 AC3, AC5, AC6, A62; spec 0023 P3–P9, P25): the try-on's
// frame (P24) holds the chosen photo, whole, with «Ваше фото, видите только вы», and under it
// «Заменить фото», whose window picks another photo or uploads one (spec 0024 AC16; with none
// chosen, after «Примерить на другом фото», it stays under the zone while there are photos to
// pick, AC17); with none it is the drop
// zone, with «Загрузить фото», the camera on a touch device and the switch «Сохранить фото для
// следующих примерок» at its bottom. A file dropped on the frame uploads either way. Beside it the item, the
// month's meter and «Примерить». A new photo shows dimmed while it uploads (3.3) and is chosen
// once stored; a refusal opens board 5 with the note that the try-on was not spent.
export function PhotoPicker({
  subject,
  renderStart,
  meterText,
  photos,
  photosFailed,
  transient,
  onTransient,
  chosenId,
  onChoose,
  quota,
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
  // «Заменить фото»'s list: every photo but the chosen one (spec 0024 AC16), numbered as uploaded.
  const others = [...saved, ...(transient ? [transient] : [])]
    .map((photo, index) => ({ photo, position: index + 1 }))
    .filter(({ photo }) => photo.id !== chosenId);
  const left = quota?.left;
  const loading = photos === undefined && !photosFailed;

  const saveSwitch = (
    <Switch checked={save} disabled={full} onCheckedChange={(checked) => setSaveChoice(checked)}>
      Сохранить фото для следующих примерок
    </Switch>
  );

  const uploadProps = {
    place: 'try-on',
    save,
    refusalNote:
      left === undefined ? undefined : (
        <Notice tone="success">Примерка не списана · {triesLeftTail(left)}</Notice>
      ),
    onPendingChange: setPendingFile,
    onUploaded: (photo: UserPhoto) => {
      if (photo.transient) onTransient(photo);
      onChoose(photo.id);
    },
  } as const;

  // The frame's photo: the one on its way, the chosen one, or none (the drop zone).
  let framed: ReactNode;
  if (pendingFile) framed = <PendingPhoto file={pendingFile} />;
  else if (chosen) {
    framed = (
      <>
        {chosen.url && <Image src={chosen.url} alt="Ваше фото" fill sizes="480px" unoptimized />}
        <span className={styles.private}>
          <LockIcon size={16} />
          Ваше фото, видите только вы
        </span>
      </>
    );
  }

  return (
    <div className={styles.picker}>
      <div className={styles.photo}>
        <PhotoFrame>
          {loading ? (
            <Skeleton height="100%" />
          ) : (
            <UploadPhoto
              // Another photo chosen drops the text of a file the zone did not take.
              key={chosen?.id ?? 'none'}
              {...uploadProps}
              appearance="zone"
              // One photo at a time: none dropped while «Заменить фото» uploads another.
              disabled={pendingFile !== null}
              extra={saveSwitch}
            >
              {framed}
            </UploadPhoto>
          )}
        </PhotoFrame>
        {(chosen || others.length > 0) && (
          <UploadPhoto
            {...uploadProps}
            appearance="replace"
            disabled={pendingFile !== null}
            thumbs={
              others.length > 0
                ? (close) =>
                    others.map(({ photo, position }) => (
                      <StripThumb
                        key={photo.id}
                        photo={photo}
                        position={position}
                        onChoose={() => {
                          onChoose(photo.id);
                          close();
                        }}
                      />
                    ))
                : undefined
            }
            extra={saveSwitch}
          />
        )}
      </div>

      <div className={styles.item}>{subject}</div>

      <div className={styles.footer}>
        {photosFailed && (
          <Notice tone="error" role="alert">
            Не удалось загрузить ваши фото. Обновите страницу.
          </Notice>
        )}
        {startError && (
          <Notice tone="error" role="alert">
            {startError}
          </Notice>
        )}
        {quota && (
          <LimitMeter left={quota.left} limit={quota.limit} className={styles.meter}>
            {meterText?.(quota.left)}
          </LimitMeter>
        )}
        {renderStart(chosen && !pendingFile ? chosen.id : null, setStartError)}
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
