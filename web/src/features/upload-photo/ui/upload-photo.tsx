'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useSession } from '@/entities/session';
import { uploadPhoto, userPhotoKeys, type UserPhoto } from '@/entities/user-photo';
import { track, useTrackedElement } from '@/shared/analytics';
import { reportFailure } from '@/shared/api';
import {
  Button,
  Checkbox,
  FileInput,
  LinkButton,
  Link,
  LockIcon,
  Modal,
  Notice,
} from '@/shared/ui';

import { REFUSAL_TEXTS, refusalReason, type RefusalReason } from '../lib/refusal';
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT, TOO_BIG_TEXT, uploadErrorText } from '../lib/upload-error';
import { givePhotoConsent, usePhotoConsent } from '../model/consent';
import { PhotoTips } from './photo-tips';

import styles from './upload-photo.module.scss';

type Source = 'file' | 'camera';
type Screen = 'closed' | 'tips' | 'refused';

interface Upload {
  file: File;
  source: Source;
  // The upload that gave the consents (the analytics' `first`).
  first: boolean;
}

export interface UploadPhotoProps {
  // Where the upload is: the analytics' `place`.
  place: 'photos';
  // The saved photos are at their limit: the button is off, the api would refuse a sixth (AC3).
  disabled?: boolean;
  onUploaded?: (photo: UserPhoto) => void;
}

// Uploading a saved photo (spec 0019 board 4, board 5, AC1, AC2). A user's first upload in a
// browser opens the tips and the two consents, «На фото — я» and the processing one naming OpenAI
// (A46): the pickers stay off until both are checked, and choosing a file records them for this
// user (plan §7, A60), so their later uploads open the picker at once. «Сделать фото» is the same input with `capture` (A30). A
// refusal of the check opens its screen with the reason's advice; any other failure shows its text.
// The upload is a mutation with no retry, its file and answer not kept (`gcTime: 0`): a write is
// not repeated by itself, and both are personal data.
export function UploadPhoto({ place, disabled = false, onUploaded }: UploadPhotoProps) {
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.status === 'signed-in' ? session.user.id : undefined;
  const consented = usePhotoConsent(userId);
  const [screen, setScreen] = useState<Screen>('closed');
  const [reason, setReason] = useState<RefusalReason>('other');
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const uploadElement = useTrackedElement('photos.upload');
  const cameraElement = useTrackedElement('photos.camera');

  // The list and the events run here, not in `mutate`'s callbacks: they run after the page is left
  // during an upload too.
  const upload = useMutation({
    mutationFn: ({ file }: Upload) => uploadPhoto(file),
    retry: false,
    gcTime: 0,
    onSuccess: (_photo, { source, first }) => {
      track('Photo Uploaded', { saved: true, source, place, first });
      return queryClient.invalidateQueries({ queryKey: userPhotoKeys.all });
    },
    onError: (failure, { source, first }) => {
      const refused = refusalReason(failure);
      if (refused) track('Photo Refused', { reason: refused, source, place, first });
      else reportFailure(failure);
    },
  });
  const pending = upload.isPending;
  const pendingSource = pending ? upload.variables.source : undefined;

  function choose(source: Source) {
    return (file: File) => {
      // One photo at a time: the inputs are off while one is on its way, and a change that comes
      // before they are (or past them) is dropped.
      if (upload.isPending) return;
      setError(null);
      if (file.size > MAX_PHOTO_BYTES) {
        setError(TOO_BIG_TEXT);
        return;
      }
      const first = !consented;
      if (first && userId) givePhotoConsent(userId);
      upload.mutate(
        { file, source, first },
        {
          onSuccess: (photo) => {
            setScreen('closed');
            onUploaded?.(photo);
          },
          onError: (failure) => {
            const refused = refusalReason(failure);
            if (refused) {
              setReason(refused);
              setScreen('refused');
              return;
            }
            setError(uploadErrorText(failure));
          },
        },
      );
    };
  }

  function changeOpen(next: boolean) {
    // The upload on its way keeps the screen: it ends in the list or in a refusal.
    if (next || pending) return;
    setScreen('closed');
    setError(null);
  }

  // The two pickers; off until both consents are given, and while a photo is on its way.
  function pickers(label: string, { camera = true } = {}) {
    const off = disabled || (!consented && !(mine && agreed));
    return (
      <>
        <FileInput
          accept={PHOTO_ACCEPT}
          onFileChange={choose('file')}
          disabled={off || pendingSource === 'camera'}
          loading={pendingSource === 'file'}
          events={uploadElement}
        >
          {label}
        </FileInput>
        {camera && (
          <FileInput
            accept={PHOTO_ACCEPT}
            capture="user"
            variant="outline"
            onFileChange={choose('camera')}
            disabled={off || pendingSource === 'file'}
            loading={pendingSource === 'camera'}
            events={cameraElement}
          >
            Сделать фото
          </FileInput>
        )}
      </>
    );
  }

  const failure = error && (
    <Notice tone="error" role="alert">
      {error}
    </Notice>
  );

  return (
    <div className={styles.upload}>
      <div className={styles.actions}>
        {consented ? (
          pickers('Добавить фото')
        ) : (
          <Button
            disabled={disabled}
            onClick={() => {
              uploadElement.onClick();
              setError(null);
              setScreen('tips');
            }}
            onPointerEnter={uploadElement.onPointerEnter}
            onPointerLeave={uploadElement.onPointerLeave}
          >
            Добавить фото
          </Button>
        )}
      </div>
      {screen === 'closed' && failure}

      {screen === 'tips' && (
        <Modal
          open
          onOpenChange={changeOpen}
          title="Какое фото подойдёт"
          description="Хорошее фото — точнее примерка. Проверим автоматически и подскажем, если что-то не так."
          footer={pickers('Выбрать фото')}
        >
          <div className={styles.screen}>
            <PhotoTips />
            {!consented && (
              <div className={styles.consents}>
                <Checkbox checked={mine} onCheckedChange={setMine}>
                  На фото — я
                </Checkbox>
                <Checkbox checked={agreed} onCheckedChange={setAgreed}>
                  Даю согласие на обработку фото для примерки: фото передаётся в OpenAI (США) для
                  проверки и создания примерки
                </Checkbox>
                {!(mine && agreed) && (
                  <p className={styles.hint}>Отметьте оба пункта, чтобы продолжить</p>
                )}
              </div>
            )}
            <p className={styles.privacy}>
              <LockIcon size={16} className={styles.lock} />
              <span>
                Фото не используются для обучения моделей. Удалить их можно в любой момент в разделе
                «Мои фото». Подробнее — в{' '}
                <Link href="/privacy" target="_blank">
                  политике по работе с персональными данными
                </Link>
                .
              </span>
            </p>
            {failure}
          </div>
        </Modal>
      )}

      {screen === 'refused' && (
        <Modal
          open
          onOpenChange={changeOpen}
          title={REFUSAL_TEXTS[reason].title}
          description={REFUSAL_TEXTS[reason].advice}
          footer={
            reason === 'child'
              ? pickers('Загрузить своё фото', { camera: false })
              : pickers('Выбрать другое фото')
          }
        >
          <div className={styles.screen}>
            <p className={styles.note}>Фото не сохранено.</p>
            {reason !== 'child' && (
              <LinkButton
                className={styles.tipsLink}
                onClick={() => {
                  setError(null);
                  setScreen('tips');
                }}
              >
                Какое фото подойдёт
              </LinkButton>
            )}
            {failure}
          </div>
        </Modal>
      )}
    </div>
  );
}
