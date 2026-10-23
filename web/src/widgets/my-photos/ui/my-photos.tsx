'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  deletePhoto,
  PhotoThumb,
  setDefaultPhoto,
  useMyPhotos,
  userPhotoKeys,
} from '@/entities/user-photo';
import { UploadPhoto } from '@/features/upload-photo';
import { useTrackedElement } from '@/shared/analytics';
import { ApiError, errorText, reportFailure } from '@/shared/api';
import { Button, LinkButton, Modal, ModalClose, Notice, Skeleton, StateCard } from '@/shared/ui';

import styles from './my-photos.module.scss';

// At most five saved photos (spec 0019 A31).
export const MAX_SAVED_PHOTOS = 5;

const DELETE_TEXT = 'Фото и его копии удалятся. Результаты примерок в истории останутся.';

// A photo gone already (deleted in another tab): the list is read again, nothing to show.
function isGone(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === 404;
}

// «Мои фото» (spec 0019 board 10, AC1, AC3): the saved photos, oldest first, read in the browser
// (0017 U11); the default one marked, any other made the default with «Сделать основным»; a
// deletion confirmed in a modal that opens on «Отмена»; the upload, off at five. Each photo is
// named by its place ("Фото 2"), never by its data, and its link is only an image's `src` (A37).
// Both writes are mutations with no retry and nothing kept (`gcTime: 0`), as the upload.
export function MyPhotos() {
  const photos = useMyPhotos();
  const queryClient = useQueryClient();
  // The id of the photo whose deletion the modal confirms.
  const [target, setTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const setDefaultElement = useTrackedElement('photos.set-default');
  const deleteElement = useTrackedElement('photos.delete');

  const refresh = () => queryClient.invalidateQueries({ queryKey: userPhotoKeys.all });

  const makeDefault = useMutation({
    mutationFn: (id: string) => setDefaultPhoto(id),
    retry: false,
    gcTime: 0,
    onMutate: () => setDefaultError(null),
    onSuccess: () => refresh(),
    onError: (failure) => {
      if (isGone(failure)) {
        void refresh();
        return;
      }
      setDefaultError(errorText(failure));
      reportFailure(failure);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePhoto(id),
    retry: false,
    gcTime: 0,
    onMutate: () => setDeleteError(null),
    onSuccess: () => {
      setTarget(null);
      return refresh();
    },
    onError: (failure) => {
      if (isGone(failure)) {
        setTarget(null);
        void refresh();
        return;
      }
      setDeleteError(errorText(failure));
      reportFailure(failure);
    },
  });

  // The deletion on its way keeps the modal open: it ends in the list or in its error.
  function changeOpen(next: boolean) {
    if (next || remove.isPending) return;
    setTarget(null);
    setDeleteError(null);
  }

  if (!photos.data) {
    if (!photos.isError) {
      return (
        <div className={styles.grid} aria-busy="true">
          <Skeleton height={320} />
          <Skeleton height={320} />
        </div>
      );
    }
    return (
      <div className={styles.failed}>
        <p className={styles.failedText} role="alert">
          {errorText(photos.error)}
        </p>
        <Button variant="outline" loading={photos.isFetching} onClick={() => void photos.refetch()}>
          Повторить
        </Button>
      </div>
    );
  }

  const list = photos.data;
  const full = list.length >= MAX_SAVED_PHOTOS;

  if (list.length === 0) {
    return (
      <StateCard
        title="Здесь появятся ваши фото"
        actions={<UploadPhoto place="photos" />}
        className={styles.empty}
      >
        Загрузите фото в полный рост: мы сохраним его, чтобы в следующий раз примерка шла в два
        нажатия. Фото видите только вы.
      </StateCard>
    );
  }

  return (
    <div className={styles.photos}>
      <p className={styles.summary}>
        {list.length} из {MAX_SAVED_PHOTOS} · видите только вы · не используются для обучения
        моделей
      </p>
      {defaultError && (
        <Notice tone="error" role="alert">
          {defaultError}
        </Notice>
      )}
      <ul className={styles.grid}>
        {list.map((photo, index) => (
          <li key={photo.id} className={styles.card}>
            <PhotoThumb photo={photo} alt={`Фото ${index + 1}`} />
            <div className={styles.cardActions}>
              {!photo.isDefault && (
                <LinkButton
                  disabled={makeDefault.isPending}
                  onClick={() => {
                    setDefaultElement.onClick();
                    makeDefault.mutate(photo.id);
                  }}
                  onPointerEnter={setDefaultElement.onPointerEnter}
                  onPointerLeave={setDefaultElement.onPointerLeave}
                  aria-label={`Сделать фото ${index + 1} основным`}
                >
                  Сделать основным
                </LinkButton>
              )}
              <LinkButton
                variant="secondary"
                className={styles.delete}
                onClick={() => {
                  setDeleteError(null);
                  setTarget(photo.id);
                }}
                aria-label={`Удалить фото ${index + 1}`}
              >
                Удалить
              </LinkButton>
            </div>
          </li>
        ))}
      </ul>
      {full ? (
        <Notice>
          Можно сохранить до {MAX_SAVED_PHOTOS} фото. Чтобы добавить новое, удалите одно из
          сохранённых.
        </Notice>
      ) : null}
      <UploadPhoto place="photos" disabled={full} />

      <Modal
        title="Удалить фото?"
        description={DELETE_TEXT}
        open={target !== null}
        onOpenChange={changeOpen}
        initialFocus={cancelRef}
        footer={
          <>
            <Button
              loading={remove.isPending}
              onClick={() => {
                deleteElement.onClick();
                if (target) remove.mutate(target);
              }}
              onPointerEnter={deleteElement.onPointerEnter}
              onPointerLeave={deleteElement.onPointerLeave}
            >
              Удалить
            </Button>
            <ModalClose>
              <Button ref={cancelRef} variant="outline" disabled={remove.isPending}>
                Отмена
              </Button>
            </ModalClose>
          </>
        }
      >
        {deleteError && (
          <p className={styles.error} role="alert">
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  );
}
