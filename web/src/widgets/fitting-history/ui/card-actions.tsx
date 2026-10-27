'use client';

import Image from 'next/image';
import { type ReactNode, useState } from 'react';

import { type Fitting, historyDate, isFittingRunning, itemLabel } from '@/entities/fitting';
import { useFittingImageDownload } from '@/features/download-fitting';
import { useTrackedElement } from '@/shared/analytics';
import {
  CompareIcon,
  DownloadIcon,
  FullscreenIcon,
  IconButton,
  Menu,
  MenuItem,
  MoreIcon,
  Notice,
  RefreshIcon,
  ShareIcon,
  Sheet,
  TrashIcon,
} from '@/shared/ui';

import styles from './fitting-history.module.scss';

export interface CardActionsProps {
  fitting: Fitting;
  // A phone shows the actions in a sheet, a wider screen in a menu (board 9, 9.2).
  phone: boolean;
  onOpen: () => void;
  // «Примерить ещё раз»; absent for a running fitting, which has nothing to repeat yet.
  onRepeat?: () => void;
  // «Сравнить с другой» of the phones' sheet (A78.1); absent for an entry that cannot be chosen.
  onCompare?: () => void;
  // Asks to delete; absent for a running fitting, which web never deletes (A47).
  onDelete?: () => void;
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
  return single ? itemLabel(single) : 'Образ';
}

interface Action {
  key: string;
  icon: ReactNode;
  label: string;
  // Drawn grey and runs nothing: «Поделиться» (A14), a repeat without its photo (A93.2).
  disabled?: boolean;
  // A second line under the label: why it is disabled.
  hint?: string;
  danger?: boolean;
  events?: ReturnType<typeof useTrackedElement>;
  run: () => void;
}

// A card's actions (spec 0019 board 9, A62, A78, A93): «Открыть», «Примерить ещё раз» (disabled
// with «Фото удалено» once the photo is gone), «Поделиться» (disabled, A14) and «Скачать» (a file,
// spec 0023 P28) for a
// result, on a phone «Сравнить с другой», and «Удалить» but for a running fitting; on a wide screen
// the «⋯» menu, on a phone the actions sheet with the result's thumbnail, the item and the date,
// and under the actions the note that a repeat spends nothing.
export function CardActions({
  fitting,
  phone,
  onOpen,
  onRepeat,
  onCompare,
  onDelete,
}: CardActionsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const status = historyStatus(fitting);
  const menuElement = useTrackedElement('history.menu');
  const openElement = useTrackedElement('history.open', {
    from: 'menu',
    status,
    kind: fitting.kind,
  });
  const repeatElement = useTrackedElement('history.repeat', {
    kind: fitting.kind,
    status: status === 'failed' ? 'failed' : 'completed',
  });
  const compareElement = useTrackedElement('history.compare', { from: 'sheet' });
  const downloadElement = useTrackedElement('history.download');
  const saving = useFittingImageDownload();
  const resultUrl = fitting.status === 'completed' ? fitting.resultUrl : null;
  const photoGone = fitting.photoId === null;

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

  const offered: (Action | false | null | undefined | '')[] = [
    {
      key: 'open',
      icon: <FullscreenIcon />,
      label: 'Открыть',
      events: openElement,
      run: onOpen,
    },
    onRepeat && {
      key: 'repeat',
      icon: <RefreshIcon />,
      label: 'Примерить ещё раз',
      disabled: photoGone,
      hint: photoGone ? 'Фото удалено' : undefined,
      events: repeatElement,
      run: onRepeat,
    },
    phone &&
      onCompare && {
        key: 'compare',
        icon: <CompareIcon />,
        label: 'Сравнить с другой',
        events: compareElement,
        run: onCompare,
      },
    // A result's, disabled, sending nothing (A14, A43).
    status === 'completed' && {
      key: 'share',
      icon: <ShareIcon />,
      label: 'Поделиться',
      disabled: true,
      run: () => {},
    },
    resultUrl && {
      key: 'download',
      icon: <DownloadIcon />,
      label: 'Скачать',
      // A file through the api and the toast «Фото скачано» (spec 0023 P28); disabled while it
      // loads, so a second click sends nothing.
      disabled: saving.pending,
      events: downloadElement,
      run: () => saving.download(fitting.id),
    },
    onDelete && {
      key: 'delete',
      icon: <TrashIcon />,
      label: 'Удалить',
      danger: true,
      run: onDelete,
    },
  ];
  const actions = offered.filter((action): action is Action => !!action);

  function label(action: Action) {
    return (
      <span className={styles.actionLabel}>
        <span className={action.danger ? styles.danger : undefined}>{action.label}</span>
        {action.hint && <span className={styles.actionHint}>{action.hint}</span>}
      </span>
    );
  }

  if (!phone) {
    return (
      <Menu trigger={trigger} align="end">
        {actions.map((action) => (
          <MenuItem
            key={action.key}
            disabled={action.disabled}
            onClick={() => {
              action.events?.onClick();
              action.run();
            }}
            // A disabled action is not hovered as one (A93.2).
            onPointerEnter={action.disabled ? undefined : action.events?.onPointerEnter}
            onPointerLeave={action.disabled ? undefined : action.events?.onPointerLeave}
          >
            {label(action)}
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
                disabled={action.disabled}
                onClick={() => {
                  action.events?.onClick();
                  setSheetOpen(false);
                  action.run();
                }}
              >
                {action.icon}
                {label(action)}
              </button>
            </li>
          ))}
        </ul>
        {onRepeat && !photoGone && status === 'completed' && (
          <Notice className={styles.sheetNotice}>
            «Примерить ещё раз» с теми же фото, вещами и цветами откроет готовый результат и не
            потратит лимит.
          </Notice>
        )}
      </Sheet>
    </>
  );
}
