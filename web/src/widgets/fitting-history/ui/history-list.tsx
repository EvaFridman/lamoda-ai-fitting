'use client';

import { useEffect, useRef } from 'react';

import { type Fitting, type FittingKind, HistoryCard, useFittings } from '@/entities/fitting';
import { COMPARE_MAX, CompareCheckbox, type CompareSelection } from '@/features/compare-fittings';
import { type DeletableFitting } from '@/features/delete-fitting';
import { useTrackedElement } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { Button, ClockIcon, Skeleton, StateCard } from '@/shared/ui';

import { CardActions, historyStatus } from './card-actions';

import styles from './fitting-history.module.scss';

export interface HistoryListProps {
  // The tab's kind; undefined is every fitting.
  kind?: FittingKind;
  phone: boolean;
  selection: CompareSelection;
  // The tab has two results or more: «Сравнить с другой» is offered.
  canCompare: boolean;
  onOpen: (fitting: Fitting) => void;
  onRepeat: (fitting: Fitting) => void;
  // The fitting whose repeat is being started, if any (spec 0024 Z46).
  repeatingId: string | null;
  onDelete: (fitting: DeletableFitting) => void;
}

// One card and its tracked «Открыть» of the picture. In the selection mode a result shows its box
// and its picture chooses it; a running or failed entry cannot be compared (A93.4).
function Card({
  fitting,
  phone,
  selection,
  canCompare,
  onOpen,
  onRepeat,
  repeatingId,
  onDelete,
}: { fitting: Fitting } & Omit<HistoryListProps, 'kind'>) {
  const status = historyStatus(fitting);
  const openElement = useTrackedElement('history.open', {
    from: 'picture',
    status,
    kind: fitting.kind,
  });
  const selectable = status === 'completed';
  const choosing = selection.active && selectable;
  const checked = selection.ids.includes(fitting.id);
  return (
    <HistoryCard
      fitting={fitting}
      busy={repeatingId === fitting.id}
      onOpen={() => (choosing ? selection.toggle(fitting.id) : onOpen(fitting))}
      openEvents={choosing ? undefined : openElement}
      openLabel={
        !choosing ? undefined : checked ? 'Снять выбор для сравнения' : 'Выбрать для сравнения'
      }
      select={
        choosing ? (
          <CompareCheckbox
            checked={checked}
            disabled={!checked && selection.ids.length >= COMPARE_MAX}
            onToggle={() => selection.toggle(fitting.id)}
          />
        ) : undefined
      }
      actions={
        <CardActions
          fitting={fitting}
          phone={phone}
          onOpen={() => onOpen(fitting)}
          onRepeat={status === 'running' ? undefined : () => onRepeat(fitting)}
          repeatBusy={repeatingId !== null}
          onCompare={selectable && canCompare ? () => selection.start(fitting.id) : undefined}
          onDelete={
            status === 'running'
              ? undefined
              : () =>
                  onDelete({
                    id: fitting.id,
                    kind: fitting.kind,
                    resultUrl: fitting.resultUrl,
                    status,
                  })
          }
        />
      }
    />
  );
}

function EmptyHistory() {
  const chooseElement = useTrackedElement('history.choose-item');
  return (
    <StateCard
      icon={<ClockIcon />}
      title="Здесь появятся ваши примерки"
      className={styles.empty}
      actions={
        <Button
          href="/catalog"
          onClick={chooseElement.onClick}
          onPointerEnter={chooseElement.onPointerEnter}
          onPointerLeave={chooseElement.onPointerLeave}
        >
          Выбрать вещь для примерки
        </Button>
      }
    >
      Каждый результат сохраняется автоматически: к нему можно вернуться, сравнить с другим или
      поделиться.
    </StateCard>
  );
}

// A tab's fittings, newest first (spec 0019 AC17, board 9): a grid of `HistoryCard`s, four across on
// a wide screen and two on a phone, read in the browser by cursor; the next batch loads as the end
// of the list comes into view, or with «Показать ещё». Polled while one runs (A72).
export function HistoryList({
  kind,
  phone,
  selection,
  canCompare,
  onOpen,
  onRepeat,
  repeatingId,
  onDelete,
}: HistoryListProps) {
  const fittings = useFittings(kind);
  const endRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = fittings;

  // A failed batch waits for «Показать ещё»: loading it again by itself would repeat the failure.
  useEffect(() => {
    const end = endRef.current;
    if (!end || !hasNextPage || isFetchNextPageError) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  if (!fittings.data) {
    if (!fittings.isError) {
      return (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height="auto" className={styles.skeleton} />
          ))}
        </div>
      );
    }
    return (
      <div className={styles.failed}>
        <p className={styles.failedText} role="alert">
          {errorText(fittings.error)}
        </p>
        <Button
          variant="outline"
          loading={fittings.isFetching}
          onClick={() => void fittings.refetch()}
        >
          Повторить
        </Button>
      </div>
    );
  }

  const list = fittings.data.pages.flatMap((page) => page.items);
  if (list.length === 0) {
    // The whole history's empty state only on «Все»: an empty tab says only that it is empty.
    if (kind === undefined) return <EmptyHistory />;
    return (
      <p className={styles.emptyTab}>
        {kind === 'look' ? 'Образов пока нет' : 'Примерок одной вещи пока нет'}
      </p>
    );
  }

  return (
    <>
      <ul className={styles.grid}>
        {list.map((fitting) => (
          <li key={fitting.id}>
            <Card
              fitting={fitting}
              phone={phone}
              selection={selection}
              canCompare={canCompare}
              onOpen={onOpen}
              onRepeat={onRepeat}
              repeatingId={repeatingId}
              onDelete={onDelete}
            />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div ref={endRef} className={styles.loadMore}>
          <Button
            variant="outline"
            loading={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            Показать ещё
          </Button>
        </div>
      )}
      {fittings.isFetchNextPageError && (
        <p className={styles.failedText} role="alert">
          {errorText(fittings.error)}
        </p>
      )}
    </>
  );
}
