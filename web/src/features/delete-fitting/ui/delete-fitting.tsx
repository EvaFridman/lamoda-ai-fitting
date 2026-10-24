'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useRef, useState } from 'react';

import { deleteFitting, type Fitting, fittingKeys } from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import { ApiError, errorText, reportFailure } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Button, Modal, ModalClose, Sheet, SheetClose } from '@/shared/ui';

import styles from './delete-fitting.module.scss';

export const DELETE_TITLE = 'Удалить примерку?';
export const DELETE_TEXT = 'Результат и его фото удалятся. Потраченная примерка не вернётся.';

// A fitting that can be deleted from the history: not a running one (A47).
export type DeletableFitting = Pick<Fitting, 'id' | 'kind' | 'resultUrl'> & {
  status: 'completed' | 'failed';
};

export interface DeleteFittingProps {
  // The fitting the confirmation asks about; null keeps it closed.
  fitting: DeletableFitting | null;
  onClose: () => void;
}

// A fitting gone already (deleted in another tab): the list is read again, nothing to show.
function isGone(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === 404;
}

// The deletion of a history entry (spec 0019 AC17, A25, A78): a confirmation with the result's
// thumbnail, in a modal (on a phone a sheet) that opens on «Отмена»; «Удалить» calls
// `DELETE /fittings/:id`, a mutation with no retry and nothing kept (`gcTime: 0`), then reads the
// user's fittings and the quota again. The thumbnail's link is only an image's `src` inside an
// `mp-block` container (A37).
export function DeleteFitting({ fitting, onClose }: DeleteFittingProps) {
  const queryClient = useQueryClient();
  const phone = useMediaQuery(PHONE_QUERY);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The fitting shown: kept after the confirmation closes, so its thumbnail stays while it fades.
  const [shown, setShown] = useState(fitting);
  const [error, setError] = useState<string | null>(null);
  if (fitting !== null && fitting !== shown) setShown(fitting);
  const deleteElement = useTrackedElement('history.delete', {
    status: shown?.status ?? 'completed',
    kind: shown?.kind ?? 'single',
  });

  // The deleted fitting's own read leaves the cache: read again, it would only answer 404.
  const refresh = (id: string) => {
    queryClient.removeQueries({ queryKey: fittingKeys.detail(id) });
    return queryClient.invalidateQueries({ queryKey: fittingKeys.all });
  };

  const remove = useMutation({
    mutationFn: (id: string) => deleteFitting(id),
    retry: false,
    gcTime: 0,
    onMutate: () => setError(null),
    onSuccess: (_, id) => {
      onClose();
      return refresh(id);
    },
    onError: (failure, id) => {
      if (isGone(failure)) {
        onClose();
        void refresh(id);
        return;
      }
      setError(errorText(failure));
      reportFailure(failure);
    },
  });

  // The deletion on its way keeps the confirmation open: it ends in the list or in its error.
  function changeOpen(next: boolean) {
    if (next || remove.isPending) return;
    setError(null);
    onClose();
  }

  const thumb = shown?.resultUrl ? (
    <span className={['mp-block', phone ? styles.sheetThumb : styles.modalThumb].join(' ')}>
      {/* `unoptimized`: Next's optimizer would fetch the signed link itself. */}
      <Image className={styles.image} src={shown.resultUrl} alt="" fill sizes="72px" unoptimized />
    </span>
  ) : undefined;
  const failure = error && (
    <p className={styles.error} role="alert">
      {error}
    </p>
  );
  const confirm = (
    <Button
      fullWidth={phone}
      loading={remove.isPending}
      onClick={() => {
        deleteElement.onClick();
        if (fitting) remove.mutate(fitting.id);
      }}
      onPointerEnter={deleteElement.onPointerEnter}
      onPointerLeave={deleteElement.onPointerLeave}
    >
      Удалить
    </Button>
  );
  const cancel = (
    <Button ref={cancelRef} variant="outline" fullWidth={phone} disabled={remove.isPending}>
      Отмена
    </Button>
  );

  if (phone) {
    return (
      <Sheet
        title={DELETE_TITLE}
        description={DELETE_TEXT}
        media={thumb}
        open={fitting !== null}
        onOpenChange={changeOpen}
        initialFocus={cancelRef}
        footer={
          <>
            {confirm}
            <SheetClose>{cancel}</SheetClose>
          </>
        }
      >
        {failure || undefined}
      </Sheet>
    );
  }
  return (
    <Modal
      title={DELETE_TITLE}
      open={fitting !== null}
      onOpenChange={changeOpen}
      initialFocus={cancelRef}
      footer={
        <>
          <ModalClose>{cancel}</ModalClose>
          {confirm}
        </>
      }
    >
      <div className={styles.confirm}>
        {thumb}
        <p className={styles.text}>{DELETE_TEXT}</p>
      </div>
      {failure}
    </Modal>
  );
}
