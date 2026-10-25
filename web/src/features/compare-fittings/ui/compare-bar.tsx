'use client';

import { useTrackedElement } from '@/shared/analytics';
import { compareHref } from '@/shared/config';
import { Button, CompareIcon, IconButton } from '@/shared/ui';

import { COMPARE_MAX, type CompareSelection } from '../model/use-compare-selection';

import styles from './compare-fittings.module.scss';

export interface CompareBarProps {
  selection: CompareSelection;
  phone: boolean;
  // Fewer than two entries to compare: the mode's entry is not offered.
  available: boolean;
}

// Board 9's controls of the compare above the history: «Сравнить» (on a phone the header's icon,
// 9.1) turns the selection mode on; in it «Выбрано N из 2», «Отмена» and «Сравнить», a link to
// the compare page once two are chosen (A41, A93).
export function CompareBar({ selection, phone, available }: CompareBarProps) {
  const startElement = useTrackedElement('history.compare', { from: 'button' });
  const openElement = useTrackedElement('history.compare-open');
  const [first, second] = selection.ids;

  if (!selection.active) {
    if (!available) return null;
    const start = () => {
      startElement.onClick();
      selection.start();
    };
    if (phone) {
      return (
        <IconButton aria-label="Сравнить" size={44} variant="plain" onClick={start}>
          <CompareIcon />
        </IconButton>
      );
    }
    return (
      <Button
        variant="outline"
        size={40}
        onClick={start}
        onPointerEnter={startElement.onPointerEnter}
        onPointerLeave={startElement.onPointerLeave}
      >
        <CompareIcon />
        Сравнить
      </Button>
    );
  }

  return (
    <div className={styles.bar} role="group" aria-label="Сравнение примерок">
      <span className={styles.count} aria-live="polite">
        Выбрано {selection.ids.length} из {COMPARE_MAX}
      </span>
      <Button variant="outline" size={40} onClick={selection.cancel}>
        Отмена
      </Button>
      {first !== undefined && second !== undefined ? (
        // `mp-block`: its link names the user's fittings (A37).
        <Button
          size={40}
          className="mp-block"
          href={compareHref(first, second)}
          onClick={openElement.onClick}
          onPointerEnter={openElement.onPointerEnter}
          onPointerLeave={openElement.onPointerLeave}
        >
          <CompareIcon />
          Сравнить
        </Button>
      ) : (
        <Button size={40} disabled>
          <CompareIcon />
          Сравнить
        </Button>
      )}
    </div>
  );
}
