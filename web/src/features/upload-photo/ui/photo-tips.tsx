import { CheckIcon, CloseIcon } from '@/shared/ui';

import styles from './upload-photo.module.scss';

const GOOD = ['В полный рост, хороший свет', 'Простая или облегающая одежда, лицом к камере'];
const BAD = [
  'Слишком темно',
  'Не в полный рост',
  'Больше одного человека',
  'Дети на фото',
  'Объёмная одежда скрывает фигуру',
];

// Board 4's tips as two lists, without the canvas's example photos (web keeps no files of its
// own); the format line drops «HEIC» (spec 0019 A31).
export function PhotoTips() {
  return (
    <div className={styles.tips}>
      <div>
        <h3 className={styles.tipsTitle}>Подойдёт</h3>
        <ul className={styles.tipList}>
          {GOOD.map((tip) => (
            <li key={tip} className={styles.tip}>
              <CheckIcon size={16} className={styles.good} />
              {tip}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className={styles.tipsTitle}>Не подойдёт</h3>
        <ul className={styles.tipList}>
          {BAD.map((tip) => (
            <li key={tip} className={styles.tip}>
              <CloseIcon size={16} className={styles.bad} />
              {tip}
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.format}>JPG, PNG или WebP до 20 МБ</p>
    </div>
  );
}
