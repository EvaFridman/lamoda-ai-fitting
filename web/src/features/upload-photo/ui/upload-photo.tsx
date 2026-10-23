'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { useSession } from '@/entities/session';
import { uploadPhoto, userPhotoKeys, type UserPhoto } from '@/entities/user-photo';
import { track, useTrackedElement } from '@/shared/analytics';
import { reportFailure } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import {
  Button,
  Checkbox,
  FileInput,
  LinkButton,
  Link,
  LockIcon,
  Modal,
  Notice,
  PlusIcon,
  Spinner,
} from '@/shared/ui';

import { REFUSAL_TEXTS, refusalReason, type RefusalReason } from '../lib/refusal';
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT, TOO_BIG_TEXT, uploadErrorText } from '../lib/upload-error';
import { givePhotoConsent, usePhotoConsent } from '../model/consent';
import { PhotoTips } from './photo-tips';
import { RefusedPreview } from './refused-preview';

import styles from './upload-photo.module.scss';

type Source = 'file' | 'camera';
// `choose` is the phone's screen 4.2 after the tips' «Понятно»; on a wide screen the tips hold it.
type Screen = 'closed' | 'tips' | 'choose' | 'refused';

interface Upload {
  file: File;
  source: Source;
  // The upload that gave the consents (the analytics' `first`).
  first: boolean;
}

interface Refusal {
  file: File;
  reason: RefusalReason;
}

export interface UploadPhotoProps {
  // Where the upload is: the analytics' `place`.
  place: 'photos';
  // The saved photos are at their limit: the button is off, the api would refuse a sixth (AC3).
  disabled?: boolean;
  // `card`: board 10's dashed «Добавить фото» card in the grid of saved photos, which opens the
  // file picker at once once the consents are given. `buttons` (the default): the pickers in a row.
  appearance?: 'buttons' | 'card';
  onUploaded?: (photo: UserPhoto) => void;
}

// Uploading a saved photo (spec 0019 board 4, board 5, AC1, AC2). A user's first upload in a
// browser opens the tips and the two consents, «На фото — я» and the processing one naming OpenAI
// (A46): the pickers stay off until both are checked, and choosing a file records them for this
// user (plan §7, A60), so their later uploads open the picker at once. On a phone the tips are a
// screen of their own ending in «Понятно», then the consents and the pickers (board 4.2, A63.8).
// «Сделать фото» is the same input with `capture` (A30). A refusal of the check opens its screen
// with the chosen photo and the reason's advice; any other failure shows its text.
// The upload is a mutation with no retry, its file and answer not kept (`gcTime: 0`): a write is
// not repeated by itself, and both are personal data.
export function UploadPhoto({
  place,
  disabled = false,
  appearance = 'buttons',
  onUploaded,
}: UploadPhotoProps) {
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.status === 'signed-in' ? session.user.id : undefined;
  const consented = usePhotoConsent(userId);
  const phone = useMediaQuery(PHONE_QUERY);
  const [screen, setScreen] = useState<Screen>('closed');
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const uploadElement = useTrackedElement('photos.upload');
  const cameraElement = useTrackedElement('photos.camera');
  const cardHintId = useId();

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
            setRefusal(null);
            onUploaded?.(photo);
          },
          onError: (failure) => {
            const refused = refusalReason(failure);
            if (refused) {
              setRefusal({ file, reason: refused });
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
    setRefusal(null);
    setError(null);
  }

  function openTips() {
    setError(null);
    setScreen('tips');
  }

  // The two pickers; off until both consents are given, and while a photo is on its way. On a
  // phone's screen they are the screen's width, one under the other.
  function pickers(label: string, { camera = true, wide = false } = {}) {
    const off = disabled || (!consented && !(mine && agreed));
    return (
      <>
        <FileInput
          accept={PHOTO_ACCEPT}
          onFileChange={choose('file')}
          disabled={off || pendingSource === 'camera'}
          loading={pendingSource === 'file'}
          fullWidth={wide}
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
            fullWidth={wide}
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

  const consents = !consented && (
    <div className={styles.consents}>
      <Checkbox checked={mine} onCheckedChange={setMine}>
        На фото — я
      </Checkbox>
      <Checkbox checked={agreed} onCheckedChange={setAgreed}>
        Даю согласие на обработку фото для примерки: фото передаётся в OpenAI (США) для проверки и
        создания примерки
      </Checkbox>
      {!(mine && agreed) && <p className={styles.hint}>Отметьте оба пункта, чтобы продолжить</p>}
    </div>
  );

  const privacy = (
    <p className={styles.privacy}>
      <LockIcon size={16} className={styles.lock} />
      <span>
        Фото не используются для обучения моделей. Удалить их можно в любой момент в разделе «Мои
        фото». Подробнее — в{' '}
        <Link href="/privacy" target="_blank">
          политике по работе с персональными данными
        </Link>
        .
      </span>
    </p>
  );

  // The entry: board 10's dashed card, or the buttons. Before the consents it opens the tips.
  let entry;
  if (appearance === 'card') {
    const cardContent = (
      <>
        {/* The card has no button spinner of its own: the photo on its way shows here. */}
        {pending ? <Spinner /> : <PlusIcon />}
        <span className={styles.cardTitle}>Добавить фото</span>
        <span id={cardHintId} className={styles.cardHint}>
          в полный рост, один человек
        </span>
      </>
    );
    // Named «Добавить фото», the hint read as its description.
    const named = { 'aria-label': 'Добавить фото', 'aria-describedby': cardHintId };
    entry = consented ? (
      <FileInput
        bare
        accept={PHOTO_ACCEPT}
        onFileChange={choose('file')}
        disabled={disabled}
        loading={pending}
        className={styles.card}
        {...named}
        events={uploadElement}
      >
        {cardContent}
      </FileInput>
    ) : (
      <button
        type="button"
        className={styles.card}
        disabled={disabled}
        {...named}
        onClick={() => {
          uploadElement.onClick();
          openTips();
        }}
        onPointerEnter={uploadElement.onPointerEnter}
        onPointerLeave={uploadElement.onPointerLeave}
      >
        {cardContent}
      </button>
    );
  } else {
    entry = (
      <div className={styles.actions}>
        {consented ? (
          pickers('Добавить фото', { wide: phone })
        ) : (
          <Button
            disabled={disabled}
            fullWidth={phone}
            onClick={() => {
              uploadElement.onClick();
              openTips();
            }}
            onPointerEnter={uploadElement.onPointerEnter}
            onPointerLeave={uploadElement.onPointerLeave}
          >
            Добавить фото
          </Button>
        )}
      </div>
    );
  }

  // On a phone the tips end in «Понятно»; the consents and the pickers are the next screen.
  const phoneTips = phone && screen === 'tips';
  const phoneChoose = phone && screen === 'choose';

  return (
    <div
      className={[styles.upload, appearance === 'card' && styles.inCard].filter(Boolean).join(' ')}
    >
      {entry}
      {screen === 'closed' && failure}

      {phoneTips && (
        <Modal
          open
          wide
          onOpenChange={changeOpen}
          title="Какое фото подойдёт"
          footer={
            <Button fullWidth onClick={() => setScreen('choose')}>
              Понятно
            </Button>
          }
        >
          <PhotoTips summary={false} />
        </Modal>
      )}

      {phoneChoose && (
        <Modal
          open
          wide
          onOpenChange={changeOpen}
          title="Ваше фото"
          footer={pickers('Выбрать фото', { wide: true })}
        >
          <div className={styles.screen}>
            <div className={styles.lead}>
              <span className={styles.leadIcon} aria-hidden>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" focusable={false}>
                  <rect x="3" y="4" width="18" height="16" stroke="currentColor" />
                  <circle cx="9" cy="10" r="2" stroke="currentColor" />
                  <path d="m3 18 6-5 4 3 3-2 5 4" stroke="currentColor" />
                </svg>
              </span>
              <h3 className={styles.leadTitle}>Загрузите фото в полный рост</h3>
              <p className={styles.leadText}>
                Мы сохраним его, чтобы в следующий раз примерка шла в два нажатия. Фото видите
                только вы.
              </p>
            </div>
            {consents}
            {privacy}
            {failure}
          </div>
        </Modal>
      )}

      {!phone && (screen === 'tips' || screen === 'choose') && (
        <Modal
          open
          wide
          onOpenChange={changeOpen}
          title="Какое фото подойдёт"
          description="Хорошее фото — точнее примерка. Проверим автоматически и подскажем, если что-то не так."
          footer={pickers('Выбрать фото')}
          // The focus starts on the frame, not on the first checkbox far down, which would scroll
          // the description and the tips out of sight.
          initialFocus="popup"
        >
          <div className={styles.screen}>
            <PhotoTips />
            {consents}
            {privacy}
            {failure}
          </div>
        </Modal>
      )}

      {screen === 'refused' && refusal && (
        <Modal
          open
          wide
          onOpenChange={changeOpen}
          title={REFUSAL_TEXTS[refusal.reason].title}
          description={REFUSAL_TEXTS[refusal.reason].advice}
          media={<RefusedPreview file={refusal.file} hidden={refusal.reason === 'child'} />}
          footer={
            <>
              {refusal.reason === 'child'
                ? pickers('Загрузить своё фото', { camera: false, wide: true })
                : pickers('Выбрать другое фото', { wide: true })}
              {refusal.reason !== 'child' && (
                <LinkButton className={styles.tipsLink} onClick={openTips}>
                  Какое фото подойдёт
                </LinkButton>
              )}
            </>
          }
        >
          <div className={styles.refusedText}>
            <p className={styles.note}>Фото не сохранено.</p>
            {failure}
          </div>
        </Modal>
      )}
    </div>
  );
}
