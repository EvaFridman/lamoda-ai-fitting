'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { useSession } from '@/entities/session';
import { uploadPhoto, userPhotoKeys, type UserPhoto } from '@/entities/user-photo';
import { track, useTrackedElement } from '@/shared/analytics';
import { reportFailure } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import {
  Button,
  CameraIcon,
  Checkbox,
  FileInput,
  LinkButton,
  Link,
  LockIcon,
  Modal,
  Notice,
  PlusIcon,
  Spinner,
  UploadIcon,
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
  // Saved among «Мои фото», or a one-time photo.
  save: boolean;
  // The upload that gave the consents (the analytics' `first`).
  first: boolean;
}

interface Refusal {
  file: File;
  reason: RefusalReason;
}

export interface UploadPhotoProps {
  // Where the upload is: the analytics' `place`.
  place: 'photos' | 'try-on';
  // The saved photos are at their limit: the button is off, the api would refuse a sixth (AC3).
  disabled?: boolean;
  // `card`: board 10's dashed «Добавить фото» card in the grid of saved photos, which opens the
  // file picker at once once the consents are given. `buttons` (the default): the pickers in a row.
  // `strip`: board 3's photo picker: the dashed tiles closing the strip of `thumbs` («+ Новое»; on
  // a phone «Загрузить» and «Снять») and, on a wide screen, «Загрузить фото» and «Сделать фото»
  // under it.
  appearance?: 'buttons' | 'card' | 'strip';
  // The strip's saved photos, before its tiles (`strip` only).
  thumbs?: ReactNode;
  // `false` uploads a one-time photo, not among the saved ones (spec 0019 A24).
  save?: boolean;
  // Under the refusal's text: the try-on's «Примерка не списана · осталось N» (A62, board 5).
  refusalNote?: ReactNode;
  // The file on its way, then `null` once it is stored or refused (board 3.3 shows it dimmed).
  onPendingChange?: (file: File | null) => void;
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
  thumbs,
  save = true,
  refusalNote,
  onPendingChange,
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
    mutationFn: ({ file, save: saved }: Upload) => uploadPhoto(file, { save: saved }),
    retry: false,
    gcTime: 0,
    onSuccess: (_photo, { source, first, save: saved }) => {
      track('Photo Uploaded', { saved, source, place, first });
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
  const pendingFile = pending ? upload.variables.file : null;

  // Only a change of the file is reported: a new callback each render does not report it again.
  const pendingChangeRef = useRef(onPendingChange);
  useEffect(() => {
    pendingChangeRef.current = onPendingChange;
  });
  useEffect(() => {
    pendingChangeRef.current?.(pendingFile);
  }, [pendingFile]);

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
        { file, source, first, save },
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
  // `quiet`: both secondary with their icons, under board 3's strip.
  function pickers(label: string, { camera = true, wide = false, quiet = false } = {}) {
    const off = disabled || (!consented && !(mine && agreed));
    return (
      <>
        <FileInput
          accept={PHOTO_ACCEPT}
          onFileChange={choose('file')}
          disabled={off || pendingSource === 'camera'}
          loading={pendingSource === 'file'}
          variant={quiet ? 'secondary' : undefined}
          fullWidth={wide}
          events={uploadElement}
        >
          {quiet && <UploadIcon />}
          {label}
        </FileInput>
        {camera && (
          <FileInput
            accept={PHOTO_ACCEPT}
            capture="user"
            variant={quiet ? 'secondary' : 'outline'}
            onFileChange={choose('camera')}
            disabled={off || pendingSource === 'file'}
            loading={pendingSource === 'camera'}
            fullWidth={wide}
            events={cameraElement}
          >
            {quiet && <CameraIcon />}
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

  // A dashed tile of board 3's strip: the picker, or before the consents the tips.
  function tile(source: Source, label: string, name: string) {
    const element = source === 'file' ? uploadElement : cameraElement;
    const content = (
      <>
        {pendingSource === source ? (
          <Spinner size={24} />
        ) : source === 'file' ? (
          phone ? (
            <UploadIcon />
          ) : (
            <PlusIcon />
          )
        ) : (
          <CameraIcon />
        )}
        <span>{label}</span>
      </>
    );
    return consented ? (
      <FileInput
        bare
        accept={PHOTO_ACCEPT}
        capture={source === 'camera' ? 'user' : undefined}
        onFileChange={choose(source)}
        disabled={disabled || (pending && pendingSource !== source)}
        loading={pendingSource === source}
        className={styles.tile}
        aria-label={name}
        events={element}
      >
        {content}
      </FileInput>
    ) : (
      <button
        type="button"
        className={styles.tile}
        disabled={disabled}
        aria-label={name}
        onClick={() => {
          element.onClick();
          openTips();
        }}
        onPointerEnter={element.onPointerEnter}
        onPointerLeave={element.onPointerLeave}
      >
        {content}
      </button>
    );
  }

  // The entry: board 10's dashed card, board 3's strip, or the buttons. Before the consents it
  // opens the tips.
  let entry;
  if (appearance === 'strip') {
    entry = (
      <>
        <div className={styles.strip}>
          {thumbs}
          {phone ? (
            <>
              {tile('file', 'Загрузить', 'Загрузить фото')}
              {tile('camera', 'Снять', 'Сделать фото')}
            </>
          ) : (
            tile('file', 'Новое', 'Загрузить фото')
          )}
        </div>
        {!phone && (
          <div className={styles.stripActions}>
            {consented ? (
              pickers('Загрузить фото', { wide: true, quiet: true })
            ) : (
              <>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={disabled}
                  onClick={() => {
                    uploadElement.onClick();
                    openTips();
                  }}
                  onPointerEnter={uploadElement.onPointerEnter}
                  onPointerLeave={uploadElement.onPointerLeave}
                >
                  <UploadIcon />
                  Загрузить фото
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={disabled}
                  onClick={() => {
                    cameraElement.onClick();
                    openTips();
                  }}
                  onPointerEnter={cameraElement.onPointerEnter}
                  onPointerLeave={cameraElement.onPointerLeave}
                >
                  <CameraIcon />
                  Сделать фото
                </Button>
              </>
            )}
          </div>
        )}
      </>
    );
  } else if (appearance === 'card') {
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
      className={[styles.upload, appearance !== 'buttons' && styles.inCard]
        .filter(Boolean)
        .join(' ')}
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
            {refusalNote}
            <p className={styles.note}>Фото не сохранено.</p>
            {failure}
          </div>
        </Modal>
      )}
    </div>
  );
}
