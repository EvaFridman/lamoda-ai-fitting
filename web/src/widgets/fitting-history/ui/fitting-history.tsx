'use client';

import { useState } from 'react';

import {
  type Fitting,
  type FittingKind,
  repeatBody,
  useFittings,
  useRepeatFitting,
} from '@/entities/fitting';
import { CompareBar, COMPARE_MAX, useCompareSelection } from '@/features/compare-fittings';
import { type DeletableFitting, DeleteFitting } from '@/features/delete-fitting';
import { useTrackedElement } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { PHONE_QUERY } from '@/shared/config';
import { plural, useMediaQuery } from '@/shared/lib';
import { showToast, Tabs } from '@/shared/ui';

import { HistoryList } from './history-list';

import styles from './fitting-history.module.scss';

type Tab = 'all' | 'single' | 'look';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'single', label: 'Одна вещь' },
  { value: 'look', label: 'Образы' },
];

function tabKind(tab: Tab): FittingKind | undefined {
  return tab === 'all' ? undefined : tab;
}

const ENTRIES = ['примерка', 'примерки', 'примерок'] as const;

export const REPEAT_TOAST =
  'Такая примерка уже есть — открыли готовый результат. Лимит не потрачен.';

export interface FittingHistoryProps {
  // Opens a fitting: its result, its wait or its error (the page's try-on window).
  onOpen: (fitting: Fitting) => void;
}

// «Мои примерки» (spec 0019 T16, T27, board 9, A62, A78, A93): the subtitle «N примерок · фото
// видите только вы» with the compare's controls, the tabs «Все», «Одна вещь», «Образы», each a
// list of `HistoryCard`s with its actions, and the deletion's confirmation. «Примерить ещё раз»
// sends the entry again: an earlier result answers with the toast of A62 and spends nothing (A7),
// a new start opens its wait. Read in the browser only (spec 0017 U11); a push of a finished
// fitting reads the list again (`fittingKeys.all`, plan §6).
export function FittingHistory({ onOpen }: FittingHistoryProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [tab, setTab] = useState<Tab>('all');
  const [target, setTarget] = useState<DeletableFitting | null>(null);
  const repeat = useRepeatFitting();
  // The entry whose repeat runs: its card shows the spinner until the answer, up to two attempts
  // (spec 0024 Z46).
  const [repeatedId, setRepeatedId] = useState<string | null>(null);
  const repeatingId = repeat.isPending ? repeatedId : null;
  const shown = useFittings(tabKind(tab)).data?.pages;
  // The shown tab's first batch counts its entries (A78).
  const total = shown?.[0]?.total;
  // The results the shown tab can compare; a choice outside them (deleted) drops out.
  const results = shown
    ?.flatMap((page) => page.items)
    .filter((fitting) => fitting.status === 'completed')
    .map((fitting) => fitting.id);
  const selection = useCompareSelection(results);
  const tabElements = {
    all: useTrackedElement('history.tab', { tab: 'all' }),
    single: useTrackedElement('history.tab', { tab: 'single' }),
    look: useTrackedElement('history.tab', { tab: 'look' }),
  };
  const toastOpen = {
    single: useTrackedElement('fitting-toast.open', { kind: 'single' }),
    look: useTrackedElement('fitting-toast.open', { kind: 'look' }),
  };

  function repeatFitting(fitting: Fitting) {
    const body = repeatBody(fitting);
    if (!body || repeat.isPending) return;
    setRepeatedId(fitting.id);
    repeat.mutate(body, {
      onSuccess: (started) => {
        if (!started.repeated) {
          onOpen(started);
          return;
        }
        showToast({
          title: REPEAT_TOAST,
          actionLabel: 'Открыть',
          onAction: () => {
            toastOpen[started.kind].onClick();
            onOpen(started);
          },
        });
      },
      // The limit, a refused text or a failure: the api's text, already reported (A43).
      onError: (failure) => showToast({ title: errorText(failure), tone: 'error' }),
    });
  }

  return (
    <div className={styles.history}>
      <div className={styles.heading}>
        <p className={styles.summary}>
          {total == null ? 'Фото' : `${total} ${plural(total, ENTRIES)} · фото`} видите только вы
        </p>
        <CompareBar
          selection={selection}
          phone={phone}
          available={(results?.length ?? 0) >= COMPARE_MAX}
        />
      </div>
      <Tabs
        size="s"
        aria-label="Вид примерок"
        value={tab}
        onValueChange={(next) => {
          const value = next as Tab;
          tabElements[value].onClick();
          setTab(value);
          // Another tab is another list: the mode and its choice end with the one they were made in.
          selection.cancel();
        }}
        items={TABS.map(({ value, label }) => ({
          value,
          label,
          panel: (
            <HistoryList
              kind={tabKind(value)}
              phone={phone}
              selection={selection}
              canCompare={(results?.length ?? 0) >= COMPARE_MAX}
              // A second click of «Примерить ещё раз» lands on the picture under the closed menu:
              // nothing opens while the repeat runs, its answer decides (A93.2).
              onOpen={(fitting) => {
                if (!repeat.isPending) onOpen(fitting);
              }}
              onRepeat={repeatFitting}
              repeatingId={repeatingId}
              onDelete={setTarget}
            />
          ),
        }))}
      />
      <DeleteFitting fitting={target} onClose={() => setTarget(null)} />
    </div>
  );
}
