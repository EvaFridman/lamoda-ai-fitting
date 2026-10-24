'use client';

import { useState } from 'react';

import { type Fitting, type FittingKind, useFittings } from '@/entities/fitting';
import { type DeletableFitting, DeleteFitting } from '@/features/delete-fitting';
import { useTrackedElement } from '@/shared/analytics';
import { PHONE_QUERY } from '@/shared/config';
import { plural, useMediaQuery } from '@/shared/lib';
import { Tabs } from '@/shared/ui';

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

export interface FittingHistoryProps {
  // Opens a fitting: its result, its wait or its error (the page's try-on window).
  onOpen: (fitting: Fitting) => void;
}

// «Мои примерки» (spec 0019 T16, board 9 without compare, A62, A78): the subtitle «N примерок ·
// фото видите только вы», the tabs «Все», «Одна вещь», «Образы», each a list of `HistoryCard`s with
// its actions, and the deletion's confirmation. Read in the browser only (spec 0017 U11); a push of
// a finished fitting reads the list again (`fittingKeys.all`, plan §6).
export function FittingHistory({ onOpen }: FittingHistoryProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [tab, setTab] = useState<Tab>('all');
  const [target, setTarget] = useState<DeletableFitting | null>(null);
  // The shown tab's first batch counts its entries (A78).
  const total = useFittings(tabKind(tab)).data?.pages[0]?.total;
  const tabElements = {
    all: useTrackedElement('history.tab', { tab: 'all' }),
    single: useTrackedElement('history.tab', { tab: 'single' }),
    look: useTrackedElement('history.tab', { tab: 'look' }),
  };

  return (
    <div className={styles.history}>
      <p className={styles.summary}>
        {total == null ? 'Фото' : `${total} ${plural(total, ENTRIES)} · фото`} видите только вы
      </p>
      <Tabs
        size="s"
        aria-label="Вид примерок"
        value={tab}
        onValueChange={(next) => {
          const value = next as Tab;
          tabElements[value].onClick();
          setTab(value);
        }}
        items={TABS.map(({ value, label }) => ({
          value,
          label,
          panel: (
            <HistoryList kind={tabKind(value)} phone={phone} onOpen={onOpen} onDelete={setTarget} />
          ),
        }))}
      />
      <DeleteFitting fitting={target} onClose={() => setTarget(null)} />
    </div>
  );
}
