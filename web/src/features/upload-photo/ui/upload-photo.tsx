'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { uploadPhoto, userPhotoKeys, type UserPhoto } from '@/entities/user-photo';
import { track, useTrackedElement } from '@/shared/analytics';
import { ApiError, reportFailure } from '@/shared/api';
import { COARSE_POINTER_QUERY, MOUSE_QUERY, PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import {
  Button,
  type ButtonVariant,
  CameraIcon,
  Checkbox,
  FileInput,
  LinkButton,
  Link,
  LockIcon,
  Modal,
  Notice,
  PlusIcon,
  Sheet,
  Spinner,
  UploadIcon,
} from '@/shared/ui';

import { heicToJpeg } from '../lib/heic';
import { pastedImage, typingIn } from '../lib/paste';
import { isChildRefusal, photoRefusal, type Refusal, refusalText } from '../lib/refusal';
import {
  HEIC_FAILED_TEXT,
  MAX_PHOTO_BYTES,
  photoAccept,
  type PhotoFormat,
  photoFormat,
  TOO_BIG_TEXT,
  uploadErrorText,
  WRONG_TYPE_TEXT,
} from '../lib/upload-error';
import {
  PHOTO_CONSENT_VERSION,
  refreshPhotoConsent,
  setPhotoConsent,
  usePhotoConsent,
} from '../model/consent';
import { DropCard, dropCardClass } from './drop-card';
import { PhotoTips } from './photo-tips';
import { RefusedPreview } from './refused-preview';

import styles from './upload-photo.module.scss';

type Source = 'file' | 'camera' | 'drop' | 'paste';
// `choose` is the phone's screen 4.2 after the tips' «Понятно»; on a wide screen the tips hold it.
type Screen = 'closed' | 'tips' | 'choose' | 'refused';

interface Upload {
  file: File;
  source: Source;
  // The chosen file's own format: a HEIC's `file` is the JPEG made of it.
  format: PhotoFormat;
  // Saved among «Мои фото», or a one-time photo.
  save: boolean;
  // The upload that gave the consents (the analytics' `first`): it sends them to the api.
  first: boolean;
}

// A file chosen or dropped before the consents: it uploads once they are given.
interface Waiting {
  file: File;
  source: Source;
}

interface RefusedPhoto {
  file: File;
  refusal: Refusal;
}

// The api asked for the consents: it keeps none of this user's (a tab older than its consent).
function consentRequired(failure: unknown): boolean {
  return (
    failure instanceof ApiError &&
    failure.kind === 'http' &&
    failure.details.some((detail) => detail.code === 'CONSENT_REQUIRED')
  );
}

export interface UploadPhotoProps {
  // Where the upload is: the analytics' `place`.
  place: 'photos' | 'try-on';
  // The saved photos are at their limit: the button is off, the api would refuse a sixth (AC3).
  disabled?: boolean;
  // `card`: board 10's dashed «Добавить фото» card in the grid of saved photos, which opens the
  // file picker at once once the consents are given. `buttons` (the default): the pickers in a row.
  // `zone`: the try-on's drop zone, filling the photo's frame (spec 0023 P3, P8, P9): a file
  // dropped on it uploads; with no `children` it is the hairline `DropCard` (spec 0024 Z17), a
  // click on which picks a file, with «Выбрать файл» (on a touch device the tiles «Загрузить фото»
  // and «Сделать фото») and `extra`; with `children` (the chosen photo, the one on its way) it
  // shows them and only takes a drop.
  // `replace`: a button (`replaceLabel`, «Заменить фото» by default) and its window (P25):
  // `thumbs`, the pickers and `extra`.
  appearance?: 'buttons' | 'card' | 'zone' | 'replace';
  // `replace`'s button and window title: «Выбрать из сохранённых» with no photo chosen (spec 0024
  // Z35).
  replaceLabel?: string;
  children?: ReactNode;
  // The window's saved photos (`replace` only), given the window's close: a choice closes it.
  thumbs?: (close: () => void) => ReactNode;
  // Under the pickers (`zone` and `replace`): the try-on's save switch.
  extra?: ReactNode;
  // `false` uploads a one-time photo, not among the saved ones (spec 0019 A24).
  save?: boolean;
  // Under the refusal's text: the try-on's «Примерка не списана · осталось 7 в этом месяце» (A62, board 5).
  refusalNote?: ReactNode;
  // The file on its way, then `null` once it is stored or refused (board 3.3 shows it dimmed).
  onPendingChange?: (file: File | null) => void;
  // `true` while a photo is on its way or a HEIC is being prepared, `false` once it is done (or
  // the component goes): the page keeps its other pickers and the save switch off meanwhile.
  onBusyChange?: (busy: boolean) => void;
  onUploaded?: (photo: UserPhoto) => void;
}

// Uploading a photo (spec 0019 board 4, board 5, AC1, AC2; spec 0023 board 3's drop zone and
// «Заменить фото»). A user's first upload opens the tips and the two consents, «На фото — я» and
// the processing one naming OpenAI (A46): the pickers stay off until both are checked, and the
// upload then sends them, so the api keeps them with the user and the tips show once per account
// (spec 0023 Y1); while `/me` loads, the pickers wait. A file dropped before the consents waits
// for them. On a phone the tips are a screen of their own ending in «Понятно», then the consents
// and the pickers (board 4.2, A63.8). «Сделать фото» is the same input with `capture` (A30),
// shown only on a touch device (Y13, Y23). A refusal of the check opens its screen with
// the chosen photo and the reason's advice; any other failure shows its text.
// The upload is a mutation with no retry, its file and answer not kept (`gcTime: 0`): a write is
// not repeated by itself, and both are personal data.
export function UploadPhoto({
  place,
  disabled = false,
  appearance = 'buttons',
  replaceLabel = 'Заменить фото',
  children,
  thumbs,
  extra,
  save = true,
  refusalNote,
  onPendingChange,
  onBusyChange,
  onUploaded,
}: UploadPhotoProps) {
  const queryClient = useQueryClient();
  const consented = usePhotoConsent();
  const phone = useMediaQuery(PHONE_QUERY);
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  // The camera only for a finger, in the try-on and «Мои фото» alike (spec 0023 Y13, Y23).
  const camera = coarse;
  const accept = photoAccept(useMediaQuery(MOUSE_QUERY));
  const [screen, setScreen] = useState<Screen>('closed');
  // A HEIC being turned into a JPEG, by the picker it came from; the inputs are off meanwhile.
  const [preparing, setPreparing] = useState<Source | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [refusal, setRefusal] = useState<RefusedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploadElement = useTrackedElement('photos.upload');
  const cameraElement = useTrackedElement('photos.camera');
  const replaceElement = useTrackedElement('try-on.replace-photo');
  const cardHintId = useId();

  // The list, the consents and the events run here, not in `mutate`'s callbacks: they run after
  // the page is left during an upload too. The api keeps the sent consents before its check, so a
  // refused photo keeps them as well (plan §3.1).
  const upload = useMutation({
    mutationFn: ({ file, save: saved, first }: Upload) =>
      uploadPhoto(file, { save: saved, consent: first ? PHOTO_CONSENT_VERSION : undefined }),
    retry: false,
    gcTime: 0,
    onSuccess: (_photo, { source, format, first, save: saved }) => {
      if (first) setPhotoConsent(queryClient, true);
      track('Photo Uploaded', { saved, source, place, first, format });
      return queryClient.invalidateQueries({ queryKey: userPhotoKeys.all });
    },
    onError: (failure, { source, format, first }) => {
      const refused = photoRefusal(failure);
      if (refused) {
        if (first) setPhotoConsent(queryClient, true);
        track('Photo Refused', { reason: refused.reason, source, place, first, format });
      } else if (consentRequired(failure)) setPhotoConsent(queryClient, false);
      else {
        reportFailure(failure);
        // The api stores a sent consent before the check, so a check that failed may have kept it:
        // `/me` says.
        if (first) refreshPhotoConsent(queryClient);
      }
    },
  });
  // A HEIC being prepared counts as on its way: the pickers wait, the one it came from spins.
  const pending = upload.isPending || preparing !== null;
  const pendingSource = upload.isPending ? upload.variables.source : (preparing ?? undefined);
  // Only the upload's file: a HEIC is reported once it is a JPEG the page can show.
  const pendingFile = upload.isPending ? upload.variables.file : null;

  // Only a change of the file is reported: a new callback each render does not report it again.
  const pendingChangeRef = useRef(onPendingChange);
  useEffect(() => {
    pendingChangeRef.current = onPendingChange;
  });
  useEffect(() => {
    pendingChangeRef.current?.(pendingFile);
  }, [pendingFile]);
  // Unmounted with a file on its way (the chosen photo gone under «Заменить фото»): the page
  // shows it no longer.
  useEffect(() => () => pendingChangeRef.current?.(null), []);
  // Only a change is reported, so a component mounting idle does not clear another one's state.
  const busyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    busyChangeRef.current = onBusyChange;
  });
  useEffect(() => {
    if (!pending) return;
    busyChangeRef.current?.(true);
    return () => busyChangeRef.current?.(false);
  }, [pending]);
  // A photo on its way elsewhere makes this one's last text stale.
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setError(null);
  }

  // A file dropped beside the zone would open in the tab and leave the try-on: while the zone is
  // shown, such a drop does nothing.
  useEffect(() => {
    if (appearance !== 'zone') return;
    // The zone's own handlers come first and keep their `copy`; elsewhere the cursor says no.
    const guard = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, [appearance]);

  function openTips() {
    setError(null);
    setReplacing(false);
    setScreen('tips');
  }

  async function send(file: File, source: Source) {
    // One photo at a time: the inputs are off while one is on its way, and a change that comes
    // before they are (or past them) is dropped.
    if (upload.isPending || preparing) return;
    setError(null);
    // A file of another type the picker's «All files» let in is refused here, as a dropped one.
    const format = photoFormat(file);
    if (!format) {
      setReplacing(false);
      setWaiting(null);
      setError(WRONG_TYPE_TEXT);
      return;
    }
    // A HEIC over the limit is not read into the tab's memory: its JPEG would be bigger still.
    if (format === 'heic' && file.size > MAX_PHOTO_BYTES) {
      setReplacing(false);
      setWaiting(null);
      setError(TOO_BIG_TEXT);
      return;
    }
    let photo = file;
    if (format === 'heic') {
      // «Заменить фото»'s window stays open meanwhile, its picker spinning. Like an upload, the
      // conversion and the upload after it go on when the window closes.
      setPreparing(source);
      try {
        photo = await heicToJpeg(file);
      } catch {
        // A file waiting for the consents goes too: the pickers come back for another one.
        setReplacing(false);
        setWaiting(null);
        setError(HEIC_FAILED_TEXT);
        return;
      } finally {
        setPreparing(null);
      }
    }
    setReplacing(false);
    // The JPEG made of a HEIC is what counts.
    if (photo.size > MAX_PHOTO_BYTES) {
      setWaiting(null);
      setError(TOO_BIG_TEXT);
      return;
    }
    setWaiting(null);
    upload.mutate(
      { file: photo, source, format, first: !consented, save },
      {
        onSuccess: (photo) => {
          setScreen('closed');
          setRefusal(null);
          onUploaded?.(photo);
        },
        onError: (failure) => {
          const refused = photoRefusal(failure);
          if (refused) {
            // The uploaded JPEG, not a HEIC most browsers cannot show.
            setRefusal({ file: photo, refusal: refused });
            setScreen('refused');
            return;
          }
          if (consentRequired(failure)) {
            // The consents again, then this file.
            setMine(false);
            setAgreed(false);
            setWaiting({ file, source });
            openTips();
            return;
          }
          setError(uploadErrorText(failure));
        },
      },
    );
  }

  function choose(source: Source) {
    return (file: File) => void send(file, source);
  }

  // A file dropped on the zone (the first one) or pasted, of the types the upload takes; before
  // the consents it waits for them. A HEIC's JPEG is checked again once it is made.
  function drop(file: File, source: 'drop' | 'paste') {
    if (pending || disabled || consented === undefined) return;
    if (!photoFormat(file)) {
      setError(WRONG_TYPE_TEXT);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(TOO_BIG_TEXT);
      return;
    }
    if (consented) {
      void send(file, source);
      return;
    }
    setWaiting({ file, source });
    openTips();
  }

  // Ctrl/Cmd+V with an image, while the zone is shown and no text field is focused, takes it as a
  // dropped one (spec 0024 Z16; not on «Мои фото»). A paste of text, or into a field, goes on as
  // it would.
  const dropRef = useRef(drop);
  useEffect(() => {
    dropRef.current = drop;
  });
  const zoneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (appearance !== 'zone') return;
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || typingIn(event.target)) return;
      // A window over the zone («Заменить фото», the tips) has the focus and its own pickers: a
      // paste there is not the zone's. The try-on's own window holds the zone, so it counts.
      const dialog =
        event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (dialog && zoneRef.current && !dialog.contains(zoneRef.current)) return;
      const file = pastedImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      dropRef.current(file, 'paste');
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [appearance]);

  // Only a drag that carries files, while the zone takes one, darkens it and may be dropped; the
  // rest is refused by the cursor.
  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  const accepting = !disabled && !pending && consented !== undefined;
  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (!accepting) return;
      setError(null);
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = accepting ? 'copy' : 'none';
      // A browser that names no `relatedTarget` on a leave between the zone's own nodes darkens it
      // again here, as the drag goes on.
      if (accepting && !dragging) setDragging(true);
    },
    // Left for a node outside the zone (or none: off the page), not for one of its own.
    onDragLeave: (event: DragEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) drop(file, 'drop');
    },
  };

  function changeOpen(next: boolean) {
    // The upload on its way keeps the screen: it ends in the list or in a refusal.
    if (next || pending) return;
    setScreen('closed');
    setWaiting(null);
    setRefusal(null);
    setError(null);
  }

  const ready = consented === true || (mine && agreed);

  // The two pickers; off until both consents are given, and while a photo is on its way. On a
  // phone's screen they are the screen's width, one under the other.
  // `quiet`: both secondary with their icons. `withCamera: false`: the file picker alone.
  function pickers(label: string, { withCamera = camera, wide = false, quiet = false } = {}) {
    const off = disabled || !ready;
    return (
      <>
        <FileInput
          accept={accept}
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
        {withCamera && (
          <FileInput
            accept={accept}
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

  // A box checked or unchecked; the second one checked uploads the file waiting for them (plan
  // §4.2).
  function check(nextMine: boolean, nextAgreed: boolean) {
    setMine(nextMine);
    setAgreed(nextAgreed);
    if (nextMine && nextAgreed && waiting) void send(waiting.file, waiting.source);
  }

  // The screen's footer: with a file waiting for the consents, «Загрузить фото», which says what
  // the boxes do (the second one uploads it) and spins while it goes.
  function screenFooter(label: string, options: { withCamera?: boolean; wide?: boolean } = {}) {
    const dropped = pendingSource === 'drop' || pendingSource === 'paste';
    if (!waiting && !(pending && dropped)) return pickers(label, options);
    return (
      <Button
        fullWidth={options.wide}
        disabled={disabled || !ready || pending}
        loading={pending}
        onClick={() => waiting && void send(waiting.file, waiting.source)}
      >
        Загрузить фото
      </Button>
    );
  }

  // A picker outside the screens: the file input once the consents are given, else a button that
  // opens the tips; off while `/me` loads (`consented` unknown).
  function picker(
    source: 'file' | 'camera',
    {
      label,
      variant,
      fullWidth,
      icon,
      tile = false,
    }: {
      label: string;
      variant?: ButtonVariant;
      fullWidth?: boolean;
      icon?: ReactNode;
      // A white framed tile, the icon over the label (board 3's «Загрузить» and «Снять»).
      tile?: boolean;
    },
  ) {
    const element = source === 'file' ? uploadElement : cameraElement;
    if (tile) {
      const content = (
        <>
          {icon}
          <span>{label}</span>
        </>
      );
      return consented ? (
        <FileInput
          bare
          className={dropCardClass.tile}
          accept={accept}
          capture={source === 'camera' ? 'user' : undefined}
          onFileChange={choose(source)}
          disabled={disabled || (pending && pendingSource !== source)}
          loading={pendingSource === source}
          events={element}
        >
          {content}
        </FileInput>
      ) : (
        <button
          type="button"
          className={dropCardClass.tile}
          disabled={disabled || consented === undefined}
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
    if (consented) {
      return (
        <FileInput
          accept={accept}
          capture={source === 'camera' ? 'user' : undefined}
          onFileChange={choose(source)}
          disabled={disabled || (pending && pendingSource !== source)}
          loading={pendingSource === source}
          variant={variant}
          fullWidth={fullWidth}
          events={element}
        >
          {icon}
          {label}
        </FileInput>
      );
    }
    return (
      <Button
        variant={variant}
        fullWidth={fullWidth}
        disabled={disabled || consented === undefined}
        onClick={() => {
          element.onClick();
          openTips();
        }}
        onPointerEnter={element.onPointerEnter}
        onPointerLeave={element.onPointerLeave}
      >
        {icon}
        {label}
      </Button>
    );
  }

  const failure = error && (
    <Notice tone="error" role="alert">
      {error}
    </Notice>
  );

  const consents = !consented && (
    <div className={styles.consents}>
      <Checkbox checked={mine} onCheckedChange={(checked) => check(checked, agreed)}>
        На фото — я
      </Checkbox>
      <Checkbox checked={agreed} onCheckedChange={(checked) => check(mine, checked)}>
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

  // «Заменить фото»'s pickers: «Загрузить фото» with a mouse; on a touch device it and «Сделать
  // фото» as the drop zone's two tiles side by side, which fit a phone's window.
  const replacePickers = camera ? (
    <div className={styles.zoneTiles}>
      {picker('file', { label: 'Загрузить фото', icon: <UploadIcon />, tile: true })}
      {picker('camera', { label: 'Сделать фото', icon: <CameraIcon />, tile: true })}
    </div>
  ) : (
    <div className={styles.zoneActions}>
      {picker('file', { label: 'Загрузить фото', variant: 'secondary', icon: <UploadIcon /> })}
    </div>
  );

  // The entry: the try-on's drop zone or «Заменить фото», board 10's dashed card, or the buttons.
  // Before the consents it opens the tips.
  let entry;
  if (appearance === 'zone') {
    const empty = children === undefined || children === null;
    // A click anywhere on the card picks a file. Only the pointer's: the keyboard and a screen
    // reader reach «Выбрать файл» or the tiles, not a second control of the same action (Z47).
    const area = consented ? (
      <FileInput
        bare
        accept={accept}
        onFileChange={choose('file')}
        disabled={disabled || pending}
        loading={pendingSource === 'file'}
        className={dropCardClass.area}
        aria-label="Загрузить фото"
        tabIndex={-1}
        aria-hidden
        events={uploadElement}
      >
        {null}
      </FileInput>
    ) : (
      <button
        type="button"
        className={dropCardClass.area}
        disabled={disabled || consented === undefined}
        aria-label="Загрузить фото"
        tabIndex={-1}
        aria-hidden
        onClick={() => {
          uploadElement.onClick();
          openTips();
        }}
        onPointerEnter={uploadElement.onPointerEnter}
        onPointerLeave={uploadElement.onPointerLeave}
      />
    );
    // With a mouse the text link «Выбрать файл»; before the consents it opens the tips.
    const chooseLink = consented ? (
      <FileInput
        bare
        accept={accept}
        onFileChange={choose('file')}
        disabled={disabled || pending}
        loading={pendingSource === 'file'}
        className={dropCardClass.link}
        events={uploadElement}
      >
        Выбрать файл
      </FileInput>
    ) : (
      <button
        type="button"
        className={dropCardClass.link}
        disabled={disabled || consented === undefined}
        onClick={() => {
          uploadElement.onClick();
          openTips();
        }}
        onPointerEnter={uploadElement.onPointerEnter}
        onPointerLeave={uploadElement.onPointerLeave}
      >
        Выбрать файл
      </button>
    );
    entry = (
      <div
        ref={zoneRef}
        className={[styles.zone, !empty && dragging && styles.dragging].filter(Boolean).join(' ')}
        {...dropHandlers}
      >
        {empty ? (
          <DropCard
            touch={camera}
            dragging={dragging}
            disabled={disabled || pending || consented === undefined}
            area={area}
            actions={
              camera ? (
                <>
                  {picker('file', { label: 'Загрузить фото', icon: <UploadIcon />, tile: true })}
                  {picker('camera', { label: 'Сделать фото', icon: <CameraIcon />, tile: true })}
                </>
              ) : (
                chooseLink
              )
            }
            extra={extra}
          />
        ) : (
          children
        )}
        {!empty && dragging && <span className={styles.dropHint}>Отпустите, чтобы загрузить</span>}
        {preparing && (
          <span className={styles.preparing} role="status">
            <Spinner />
            Готовим фото…
          </span>
        )}
        {screen === 'closed' && error && <div className={styles.zoneError}>{failure}</div>}
      </div>
    );
  } else if (appearance === 'replace') {
    const close = () => setReplacing(false);
    const windowContent = (
      <div className={styles.replace}>
        {thumbs && <div className={styles.thumbs}>{thumbs(close)}</div>}
        {replacePickers}
        {extra}
      </div>
    );
    const title = replaceLabel;
    entry = (
      <>
        <Button
          variant="outline"
          fullWidth
          disabled={disabled || pending}
          onClick={() => {
            replaceElement.onClick();
            setError(null);
            setReplacing(true);
          }}
          onPointerEnter={replaceElement.onPointerEnter}
          onPointerLeave={replaceElement.onPointerLeave}
        >
          {replaceLabel}
        </Button>
        {phone ? (
          <Sheet open={replacing} onOpenChange={setReplacing} title={title}>
            {windowContent}
          </Sheet>
        ) : (
          <Modal open={replacing} onOpenChange={setReplacing} title={title}>
            {windowContent}
          </Modal>
        )}
        {screen === 'closed' && failure}
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
        accept={accept}
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
        disabled={disabled || consented === undefined}
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
            disabled={disabled || consented === undefined}
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
      className={[
        styles.upload,
        appearance !== 'buttons' && styles.inCard,
        appearance === 'zone' && styles.inZone,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {entry}
      {screen === 'closed' && appearance !== 'zone' && appearance !== 'replace' && failure}

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
          footer={screenFooter('Выбрать фото', { wide: true })}
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
          footer={screenFooter('Выбрать фото')}
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
          title={refusalText(refusal.refusal).title}
          description={refusalText(refusal.refusal).advice}
          media={<RefusedPreview file={refusal.file} hidden={isChildRefusal(refusal.refusal)} />}
          footer={
            <>
              {isChildRefusal(refusal.refusal)
                ? pickers('Загрузить своё фото', { withCamera: false, wide: true })
                : pickers('Выбрать другое фото', { wide: true })}
              {!isChildRefusal(refusal.refusal) && (
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
