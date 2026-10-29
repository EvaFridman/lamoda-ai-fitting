'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFittingImage, saveFittingFile } from '@/entities/fitting';
import { errorText, reportFailure } from '@/shared/api';
import { showToast } from '@/shared/ui';

// How «Поделиться» delivers the file: the system's share sheet, or a saved file (spec 0024 Z13).
export type ShareMethod = 'system' | 'download';

export interface FittingShare {
  // Fetches the file ahead, once per fitting: Safari shares only within the click's activation,
  // which an `await` of the file would spend (spec 0024 plan §4.3, §5).
  prefetch: () => void;
  share: () => void;
  // The way a click takes now (`result.share`'s `method`).
  method: ShareMethod;
  // The file fetched ahead, if it is here: «Скачать» saves it without another read.
  file: File | null;
  // The file loads for a click: its control waits.
  pending: boolean;
}

export interface FittingShareOptions {
  // The fitting shared; `null` while it has no picture.
  fittingId: string | null;
  // Fetch the file as soon as there is one (a touch device, where no hover comes first).
  eager: boolean;
}

const SAVED_TEXT = 'Файл сохранён — отправьте его из галереи';

function canShareFile(file: File | null): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  // Without the file yet, the API's presence: the file is an image the sheet takes.
  return file ? navigator.canShare({ files: [file] }) : true;
}

function saveInstead(file: File) {
  saveFittingFile(file);
  showToast({ title: SAVED_TEXT });
}

// «Поделиться» of the result (spec 0024 Z13, AC24): the picture as a file through the Web Share
// API; where files cannot be shared (Firefox, an old browser) or the sheet refuses
// (`NotAllowedError`), the file is saved with «Файл сохранён — отправьте его из галереи», so a
// click never ends in nothing. A cancelled sheet (`AbortError`) shows nothing. The file stays in
// memory for the result's lifetime, never in the page.
export function useFittingShare({ fittingId, eager }: FittingShareOptions): FittingShare {
  const [ready, setReady] = useState<{ id: string; file: File } | null>(null);
  const [pending, setPending] = useState(false);
  // The fetch of the current fitting's file, shared by the prefetch and a click.
  const loadRef = useRef<{ id: string; promise: Promise<File> } | null>(null);
  const runningRef = useRef(false);
  const file = ready && ready.id === fittingId ? ready.file : null;

  const load = useCallback((): Promise<File> | null => {
    if (fittingId === null) return null;
    if (loadRef.current?.id === fittingId) return loadRef.current.promise;
    const id = fittingId;
    const promise = fetchFittingImage(id);
    loadRef.current = { id, promise };
    promise.then(
      (loaded) => {
        if (loadRef.current?.id === id) setReady({ id, file: loaded });
      },
      () => {
        // A failed fetch is tried again by the next hover or click.
        if (loadRef.current?.promise === promise) loadRef.current = null;
      },
    );
    return promise;
  }, [fittingId]);

  const prefetch = useCallback(() => {
    // Its failure is the click's to say, if one comes: the prefetch says nothing.
    load()?.catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (eager) prefetch();
  }, [eager, prefetch]);

  const share = useCallback(() => {
    if (runningRef.current) return;
    // Until the sheet closes: a second click meanwhile would be refused (`InvalidStateError`) and
    // save the file beside the sheet.
    const deliver = async (shared: File) => {
      if (!canShareFile(shared)) {
        saveInstead(shared);
        return;
      }
      try {
        await navigator.share({ files: [shared], title: 'Моя примерка' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        saveInstead(shared);
      }
    };
    runningRef.current = true;
    // Shared within the click while the file is at hand.
    if (file) {
      void deliver(file).finally(() => {
        runningRef.current = false;
      });
      return;
    }
    const promise = load();
    if (!promise) {
      runningRef.current = false;
      return;
    }
    setPending(true);
    promise
      .then(deliver)
      .catch((failure: unknown) => {
        reportFailure(failure);
        showToast({ title: errorText(failure), tone: 'error' });
      })
      .finally(() => {
        runningRef.current = false;
        setPending(false);
      });
  }, [file, load]);

  return { prefetch, share, method: canShareFile(file) ? 'system' : 'download', file, pending };
}
