import styles from './examples.module.scss';
import { DropCardDemo } from './drop-card-demo';
import { FileInputDemo } from './file-input-demo';

// The file picker as a kit button. On a phone `capture` opens the camera; elsewhere it is the
// usual picker (spec 0019 A30).
export function FileInputSection() {
  return (
    <>
      <p className={styles.caption}>
        Кнопка кита открывает выбор файла. С capture телефон сразу открывает камеру, компьютер —
        обычный выбор файла. Один файл за раз; тот же файл можно выбрать снова.
      </p>
      <h3 className={styles.heading}>FileInput</h3>
      <FileInputDemo />
      <h3 className={styles.heading}>DropCard</h3>
      <p className={styles.caption}>
        Пустая зона примерки: тонкая рамка, «+» в круге, призыв и форматы внизу. Наведение делает
        круг чёрным, файл над карточкой — рамку чёрной и фон серым. На устройстве с пальцем вместо
        ссылки две плитки.
      </p>
      <DropCardDemo />
    </>
  );
}
