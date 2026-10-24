'use client';

import Image from 'next/image';
import { useState } from 'react';

import {
  type Fitting,
  historyDate,
  isFittingRunning,
  itemLabel,
  kindBadge,
} from '@/entities/fitting';
import { useTrackedElement } from '@/shared/analytics';
import {
  DownloadIcon,
  FullscreenIcon,
  IconButton,
  Menu,
  MenuItem,
  MoreIcon,
  Sheet,
  TrashIcon,
} from '@/shared/ui';

import styles from './fitting-history.module.scss';

export interface CardActionsProps {
  fitting: Fitting;
  // A phone shows the actions in a sheet, a wider screen in a menu (board 9, 9.2).
  phone: boolean;
  onOpen: () => void;
  // Asks to delete; absent for a running fitting, which web never deletes (A47).
  onDelete?: () => void;
}

// Saves the result: a link made on the click and dropped at once, so the signed link never sits in
// the page's markup (A37). The storage's link is another origin, where `download` does not apply:
// the picture opens in a new tab, from which it is saved (A77.9).
function download(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = 'primerka.webp';
  link.target = '_blank';
  link.rel = 'noopener';
  link.click();
}

// A card's state as the analytics name it: a pending and a processing fitting both run.
export function historyStatus(
  fitting: Pick<Fitting, 'status'>,
): 'running' | 'completed' | 'failed' {
  if (isFittingRunning(fitting)) return 'running';
  return fitting.status === 'failed' ? 'failed' : 'completed';
}

// The heading of a card's sheet: the item and its colour, or the kind of a look.
function sheetTitle(fitting: Fitting): string {
  const single = fitting.kind === 'single' ? fitting.items[0] : undefined;
  return single ? itemLabel(single) : (kindBadge(fitting) ?? 'Образ');
}

// A card's actions (spec 0019 board 9, A78): «Открыть», «Скачать» for a result, «Удалить» but for
// a running fitting; on a wide screen the «⋯» menu, on a phone the actions sheet with the result's
// thumbnail, the item and the date. T27 adds «Примерить ещё раз», «Поделиться» and «Сравнить».
export function CardActions({ fitting, phone, onOpen, onDelete }: CardActionsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuElement = useTrackedElement('history.menu');
  const openElement = useTrackedElement('history.open', {
    from: 'menu',
    status: historyStatus(fitting),
    kind: fitting.kind,
  });
  const downloadElement = useTrackedElement('history.download');
  const resultUrl = fitting.status === 'completed' ? fitting.resultUrl : null;

  const trigger = (
    <IconButton
      aria-label="Действия"
      size={44}
      variant="plain"
      className={styles.moreButton}
      onClick={() => {
        menuElement.onClick();
        if (phone) setSheetOpen(true);
      }}
      onPointerEnter={menuElement.onPointerEnter}
      onPointerLeave={menuElement.onPointerLeave}
    >
      <MoreIcon />
    </IconButton>
  );

  const actions = [
    {
      key: 'open',
      icon: <FullscreenIcon />,
      label: 'Открыть',
      events: openElement,
      run: onOpen,
    },
    resultUrl && {
      key: 'download',
      icon: <DownloadIcon />,
      label: 'Скачать',
      events: downloadElement,
      run: () => download(resultUrl),
    },
    onDelete && {
      key: 'delete',
      icon: <TrashIcon />,
      label: 'Удалить',
      danger: true,
      run: onDelete,
    },
  ].filter((action) => !!action);

  if (!phone) {
    return (
      <Menu trigger={trigger} align="end">
        {actions.map((action) => (
          <MenuItem
            key={action.key}
            onClick={() => {
              action.events?.onClick();
              action.run();
            }}
            onPointerEnter={action.events?.onPointerEnter}
            onPointerLeave={action.events?.onPointerLeave}
          >
            <span className={action.danger ? styles.danger : undefined}>{action.label}</span>
          </MenuItem>
        ))}
      </Menu>
    );
  }

  return (
    <>
      {trigger}
      <Sheet
        title={sheetTitle(fitting)}
        description={historyDate(fitting.createdAt)}
        media={
          resultUrl ? (
            <span className={['mp-block', styles.sheetThumb].join(' ')}>
              {/* `unoptimized`: Next's optimizer would fetch the signed link itself. */}
              <Image
                className={styles.thumbImage}
                src={resultUrl}
                alt=""
                fill
                sizes="48px"
                unoptimized
              />
            </span>
          ) : undefined
        }
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      >
        <ul className={styles.sheetActions}>
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                className={[styles.sheetAction, action.danger && styles.danger]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  action.events?.onClick();
                  setSheetOpen(false);
                  action.run();
                }}
              >
                {action.icon}
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
