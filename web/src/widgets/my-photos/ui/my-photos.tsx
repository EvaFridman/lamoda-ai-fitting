'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import {
  deletePhoto,
  PhotoThumb,
  SavedPhotoCard,
  setDefaultPhoto,
  useMyPhotos,
  userPhotoKeys,
  type UserPhoto,
} from '@/entities/user-photo';
import { UploadPhoto } from '@/features/upload-photo';
import { useTrackedElement } from '@/shared/analytics';
import { ApiError, errorText, reportFailure } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import {
  Button,
  LockIcon,
  Modal,
  ModalClose,
  Notice,
  Sheet,
  SheetClose,
  Skeleton,
  StateCard,
} from '@/shared/ui';

import styles from './my-photos.module.scss';

// At most five saved photos (spec 0019 A31).
export const MAX_SAVED_PHOTOS = 5;

const DELETE_TEXT = 'Фото и его копии удалятся. Результаты примерок в истории останутся.';

// A photo gone already (deleted in another tab): the list is read again, nothing to show.
function isGone(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === 404;
}

// «Мои фото» (spec 0019 board 10, AC1, AC3, A63.8): the saved photos, oldest first, read in the
// browser (0017 U11), as `SavedPhotoCard`s in a grid closed by the dashed «Добавить фото» card, or
// on a phone as rows over the upload's button; the default one marked, any other made the default
// with «Сделать основным»; a deletion confirmed in a modal (on a phone a sheet) with the photo's
// thumbnail that opens on «Отмена»; the upload, off at five. Each photo is named by its place
// ("Фото 2"), never by its data, and its link is only an image's `src` (A37). Both writes are
// mutations with no retry and nothing kept (`gcTime: 0`), as the upload.
export function MyPhotos() {
  const photos = useMyPhotos();
  const queryClient = useQueryClient();
  const phone = useMediaQuery(PHONE_QUERY);
  // The id of the photo whose deletion the confirmation asks about.
  const [target, setTarget] = useState<string | null>(null);
  // The photo the confirmation shows: kept after it closes, so its thumbnail stays while the modal
  // or the sheet fades out.
  const [shown, setShown] = useState<{ photo: UserPhoto; position: number } | null>(null);
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

  // The deletion on its way keeps the confirmation open: it ends in the list or in its error.
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

  const targetThumb = shown && (
    <PhotoThumb
      photo={shown.photo}
      alt={`Фото ${shown.position}`}
      showDefault={false}
      className={phone ? styles.sheetThumb : styles.modalThumb}
    />
  );
  const deleteFailure = deleteError && (
    <p className={styles.error} role="alert">
      {deleteError}
    </p>
  );
  const confirmDelete = (
    <Button
      fullWidth={phone}
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
  );
  const cancelDelete = (
    <Button ref={cancelRef} variant="outline" fullWidth={phone} disabled={remove.isPending}>
      Отмена
    </Button>
  );

  const cards = list.map((photo, index) => (
    <li key={photo.id}>
      <SavedPhotoCard
        photo={photo}
        position={index + 1}
        layout={phone ? 'row' : 'card'}
        busy={makeDefault.isPending}
        onMakeDefault={() => makeDefault.mutate(photo.id)}
        onDelete={() => {
          setDeleteError(null);
          setTarget(photo.id);
          setShown({ photo, position: index + 1 });
        }}
        makeDefaultEvents={setDefaultElement}
      />
    </li>
  ));

  const limitNote = full && (
    <Notice>
      Можно сохранить до {MAX_SAVED_PHOTOS} фото. Чтобы добавить новое, удалите одно из сохранённых.
    </Notice>
  );

  return (
    <div className={styles.photos}>
      <p className={styles.summary}>
        {list.length} из {MAX_SAVED_PHOTOS} · видите только вы
        {phone ? '' : ' · не используются для обучения моделей'}
      </p>
      {defaultError && (
        <Notice tone="error" role="alert">
          {defaultError}
        </Notice>
      )}
      {/* One list and one upload in the same place for both layouts: turning a phone across the
          break keeps the upload's open screen and the photo on its way. */}
      <ul className={phone ? styles.rows : styles.grid}>
        {cards}
        <li className={phone ? styles.addRow : styles.addCell}>
          {phone && (
            <p className={styles.privacy}>
              <LockIcon size={16} className={styles.lock} />
              Фото не используются для обучения моделей и не видны другим людям.
            </p>
          )}
          {phone && limitNote}
          <UploadPhoto place="photos" appearance={phone ? 'buttons' : 'card'} disabled={full} />
        </li>
      </ul>
      {!phone && limitNote}

      {phone ? (
        <Sheet
          title="Удалить фото?"
          description={DELETE_TEXT}
          media={targetThumb}
          open={target !== null}
          onOpenChange={changeOpen}
          initialFocus={cancelRef}
          footer={
            <>
              {confirmDelete}
              <SheetClose>{cancelDelete}</SheetClose>
            </>
          }
        >
          {deleteFailure || undefined}
        </Sheet>
      ) : (
        <Modal
          title="Удалить фото?"
          open={target !== null}
          onOpenChange={changeOpen}
          initialFocus={cancelRef}
          footer={
            <>
              <ModalClose>{cancelDelete}</ModalClose>
              {confirmDelete}
            </>
          }
        >
          <div className={styles.confirm}>
            {targetThumb}
            <p className={styles.confirmText}>{DELETE_TEXT}</p>
          </div>
          {deleteFailure}
        </Modal>
      )}
    </div>
  );
}
