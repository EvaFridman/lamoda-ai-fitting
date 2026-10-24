import { SparkleIcon } from '@/shared/ui';

import styles from './ai-label.module.scss';

export interface AiLabelProps {
  className?: string;
}

// Board 13's AILabel: «Сгенерировано ИИ» over every generated picture, in its top left corner
// (spec 0019 AC5). Its parent is positioned; the caption under the picture is the page's.
export function AiLabel({ className }: AiLabelProps) {
  return (
    <span className={[styles.label, className].filter(Boolean).join(' ')}>
      <SparkleIcon size={16} />
      Сгенерировано ИИ
    </span>
  );
}
