'use client';

import { useCallback, useRef, useState } from 'react';

import { downloadFittingImage } from '@/entities/fitting';
import { errorText, reportFailure } from '@/shared/api';
import { showToast } from '@/shared/ui';

export interface FittingImageDownload {
  download: (id: string) => void;
  // A download in progress: its control waits.
  pending: boolean;
}

// «Скачать» of the result and the history (spec 0023 P28): the toast «Фото скачано» once the file
// is handed to the browser, the error's text otherwise; a second call while one runs does nothing.
export function useFittingImageDownload(): FittingImageDownload {
  const [pending, setPending] = useState(false);
  const runningRef = useRef(false);
  const download = useCallback((id: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPending(true);
    downloadFittingImage(id)
      .then(() => showToast({ title: 'Фото скачано' }))
      .catch((failure: unknown) => {
        reportFailure(failure);
        showToast({ title: errorText(failure), tone: 'error' });
      })
      .finally(() => {
        runningRef.current = false;
        setPending(false);
      });
  }, []);
  return { download, pending };
}
