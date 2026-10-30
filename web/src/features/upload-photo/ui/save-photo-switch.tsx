'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { type Fitting, fittingKeys } from '@/entities/fitting';
import { keepPhoto, unkeepPhoto, type UserPhoto, userPhotoKeys } from '@/entities/user-photo';
import { ApiError, errorText } from '@/shared/api';
import { useTrackedElement } from '@/shared/analytics';
import { Notice, Switch } from '@/shared/ui';

import styles from './save-photo-switch.module.scss';

export interface SavePhotoSwitchProps {
  // The fitting's photo, `null` once it is gone.
  photoId: string | null;
  // The fitting's `photoTransient`: `true` a one-time photo, `false` a saved one, `null` gone.
  photoTransient: boolean | null;
  // The photo is one of the window's own one-time uploads (its fitting may say otherwise yet).
  uploadedHere: boolean;
  // The switch was turned off for this photo on an earlier result of the window (a colour, a
  // regeneration): it shows off and keeps nothing by itself.
  declined?: boolean;
  // The photo is kept: it is no longer the window's one-time photo, which its close deletes.
  onKept?: (photo: UserPhoto) => void;
  // It is a one-time photo again: the window's close deletes it.
  onUnkept?: (photo: UserPhoto) => void;
  // A keep is on its way (`true`) or answered (`false`): the window's close leaves the photo to it.
  onKeeping?: (photoId: string, keeping: boolean) => void;
}

// The result's «Сохранить фото для следующих примерок» (spec 0024 AC22, plan §4.2, Z12, Z29, Z42):
// shown for a result on a one-time photo, on by default. What it shows is taken once, from the
// fitting the result opens with, and kept for the result's lifetime, so the switch stays after its
// own keep and can be turned off and on again. A photo already gone says «Фото уже удалено», a
// saved one shows nothing.
export function SavePhotoSwitch({
  photoId,
  photoTransient,
  uploadedHere,
  declined = false,
  ...rest
}: SavePhotoSwitchProps) {
  const [own] = useState(() => ({
    id: photoId,
    shown:
      uploadedHere || photoTransient === true ? 'switch' : photoTransient === null ? 'gone' : null,
    declined,
  }));
  if (own.shown === null) return null;
  if (own.shown === 'gone' || own.id === null) return <PhotoGone />;
  return <KeepSwitch photoId={own.id} declined={own.declined} {...rest} />;
}

function PhotoGone() {
  return <p className={styles.gone}>Фото уже удалено</p>;
}

type KeepState = 'on' | 'off' | 'full' | 'gone';

function isLimit(failure: unknown): boolean {
  return failure instanceof ApiError && failure.code === 'LIMIT_REACHED';
}

function isGone(failure: unknown): boolean {
  return failure instanceof ApiError && failure.kind === 'http' && failure.status === 404;
}

// The cached fittings on this photo learn its new kind, so a result opened again from them takes
// the right one (a photo kept shows no switch, AC22).
function setPhotoTransient(
  queryClient: ReturnType<typeof useQueryClient>,
  photoId: string,
  transient: boolean,
) {
  queryClient.setQueriesData<Fitting | null>(
    { queryKey: fittingKeys.all, predicate: (query) => query.queryKey[2] === 'detail' },
    (fitting) =>
      fitting?.photoId === photoId ? { ...fitting, photoTransient: transient } : fitting,
  );
}

// Keeps the photo once it mounts (`PUT …/keep`), unless it was `declined`; off returns it to a one-time one (`DELETE …/keep`,
// Z26.4). At five saved photos it is off and disabled with no text (Z29). The writes are not
// repeated by themselves; their answers update «Мои фото» and the window's one-time photos even
// after the result is left.
function KeepSwitch({
  photoId,
  declined,
  onKept,
  onUnkept,
  onKeeping,
}: Pick<SavePhotoSwitchProps, 'onKept' | 'onUnkept' | 'onKeeping'> & {
  photoId: string;
  declined: boolean;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<KeepState>(declined ? 'off' : 'on');
  const [error, setError] = useState<string | null>(null);
  // The kept photo, given back as a one-time one when the switch goes off.
  const keptRef = useRef<UserPhoto | null>(null);
  // What a click does: `true` keeps the photo, `false` makes it a one-time one.
  const element = useTrackedElement('result.save-photo', { saved: state !== 'on' });

  const keep = useMutation({
    mutationFn: () => keepPhoto(photoId),
    retry: false,
    gcTime: 0,
    onMutate: () => onKeeping?.(photoId, true),
    onSettled: () => onKeeping?.(photoId, false),
    onSuccess: (photo) => {
      keptRef.current = photo;
      setState('on');
      onKept?.(photo);
      setPhotoTransient(queryClient, photoId, false);
      // In the list at once: the window still shows it while the list is read again.
      queryClient.setQueryData<UserPhoto[]>(userPhotoKeys.all, (list) =>
        list && !list.some(({ id }) => id === photo.id) ? [...list, photo] : list,
      );
      return queryClient.invalidateQueries({ queryKey: userPhotoKeys.all });
    },
    onError: (failure) => {
      if (isLimit(failure)) setState('full');
      else if (isGone(failure)) setState('gone');
      else {
        // An `ApiError`, already reported.
        setState('off');
        setError(errorText(failure));
      }
    },
  });
  const unkeep = useMutation({
    mutationFn: () => unkeepPhoto(photoId),
    retry: false,
    gcTime: 0,
    onSuccess: () => {
      setState('off');
      const kept = keptRef.current;
      if (kept) onUnkept?.({ ...kept, transient: true, isDefault: false });
      setPhotoTransient(queryClient, photoId, true);
      queryClient.setQueryData<UserPhoto[]>(userPhotoKeys.all, (list) =>
        list?.filter((photo) => photo.id !== photoId),
      );
      return queryClient.invalidateQueries({ queryKey: userPhotoKeys.all });
    },
    onError: (failure) => {
      if (isGone(failure)) setState('gone');
      else setError(errorText(failure));
    },
  });

  // On by default: the photo is kept as the result opens (Z12), once; a declined one is not.
  const { mutate: keepNow } = keep;
  const keptOnceRef = useRef(declined);
  useEffect(() => {
    if (keptOnceRef.current) return;
    keptOnceRef.current = true;
    keepNow();
  }, [keepNow]);

  if (state === 'gone') return <PhotoGone />;

  return (
    <div className={styles.savePhoto}>
      {/* The hovers are the row's, the label's too: the switch's own track is 34×14. */}
      <div
        className={styles.switchRow}
        onPointerEnter={element.onPointerEnter}
        onPointerLeave={element.onPointerLeave}
      >
        <Switch
          checked={state === 'on'}
          disabled={state === 'full' || keep.isPending || unkeep.isPending}
          onCheckedChange={(checked) => {
            element.onClick();
            setError(null);
            if (checked) keep.mutate();
            else unkeep.mutate();
          }}
        >
          Сохранить фото для следующих примерок
        </Switch>
      </div>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </div>
  );
}
