import type { ComponentType } from 'react';

import { CheckIcon, CloseIcon } from '@/shared/ui';

import {
  BulkyClothesPictogram,
  ChildPictogram,
  FittedClothesPictogram,
  FullLengthPictogram,
  ManyPeoplePictogram,
  NotFullLengthPictogram,
  TooDarkPictogram,
} from './pictograms';

import styles from './photo-tips.module.scss';

interface Tip {
  text: string;
  good: boolean;
  Picture: ComponentType;
}

const TIPS: readonly Tip[] = [
  { text: 'В полный рост, хороший свет', good: true, Picture: FullLengthPictogram },
  {
    text: 'Простая или облегающая одежда, лицом к камере',
    good: true,
    Picture: FittedClothesPictogram,
  },
  { text: 'Слишком темно', good: false, Picture: TooDarkPictogram },
  { text: 'Не в полный рост', good: false, Picture: NotFullLengthPictogram },
  { text: 'Больше одного человека', good: false, Picture: ManyPeoplePictogram },
  { text: 'Дети на фото', good: false, Picture: ChildPictogram },
  { text: 'Объёмная одежда скрывает фигуру', good: false, Picture: BulkyClothesPictogram },
];

// The format line drops «HEIC» (spec 0019 A31).
const SUMMARY = [
  'один человек — вы',
  'видно от макушки до стоп',
  'дневной свет или яркая лампа',
  'без детей на фото',
  'JPG, PNG или WebP до 20 МБ',
];

export interface PhotoTipsProps {
  // The «Коротко» list in the last cell; the phone's tips screen (board 4.1) has only the tiles.
  summary?: boolean;
}

// Board 4's tips (spec 0019 A63.8): two «хорошо» and five «плохо» tiles, each the canvas's
// pictogram with its ✓ or ✕ (named «Подойдёт» / «Не подойдёт» for a screen reader) and its
// caption, and the «Коротко» list in the last cell; four a row, three on a phone.
export function PhotoTips({ summary = true }: PhotoTipsProps) {
  return (
    <div className={styles.tips}>
      {TIPS.map(({ text, good, Picture }) => (
        <figure key={text} className={styles.tip}>
          <div className={styles.picture}>
            <Picture />
            <span className={[styles.mark, good ? styles.good : styles.bad].join(' ')}>
              {good ? (
                <CheckIcon size={16} title="Подойдёт" />
              ) : (
                <CloseIcon size={16} title="Не подойдёт" />
              )}
            </span>
          </div>
          <figcaption className={styles.caption}>{text}</figcaption>
        </figure>
      ))}
      {summary && (
        <div className={styles.summary}>
          <h3 className={styles.summaryTitle}>Коротко</h3>
          <ul className={styles.summaryList}>
            {SUMMARY.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
