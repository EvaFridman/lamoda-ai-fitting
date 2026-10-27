import Image from 'next/image';

import { PhotoFrame } from '@/entities/fitting';
import { CheckIcon } from '@/shared/ui';

import styles from './fitting-success.module.scss';

export interface FittingSuccessProps {
  // The result just made (a signed link; personal data, A37), or null: a grey frame.
  resultUrl: string | null;
}

// The short success screen between the wait and the result (spec 0023 P26, Y7, Y15): the result
// blurred in the try-on's one frame, a check mark, «Готово!» and «Сохранили в «Мои примерки»». The
// try-on shows it for 1.5 s after a fitting it watched completes. The picture is only an image's
// `src` (A37).
export function FittingSuccess({ resultUrl }: FittingSuccessProps) {
  return (
    <div className={styles.success}>
      <PhotoFrame>
        {resultUrl && (
          <Image className={styles.photo} src={resultUrl} alt="" fill sizes="480px" unoptimized />
        )}
        <div className={styles.plate} role="status">
          <span className={styles.check}>
            <CheckIcon />
          </span>
          <span className={styles.title}>Готово!</span>
          <span className={styles.text}>Сохранили в «Мои примерки»</span>
        </div>
      </PhotoFrame>
    </div>
  );
}
