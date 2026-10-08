import type { ComponentType } from 'react';

import {
  ArrowBackIcon,
  ArrowForwardIcon,
  CartIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CloseIcon,
  HeartFilledIcon,
  HeartIcon,
  type IconProps,
  InfoIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
} from '@/shared/ui';

import styles from './icons-section.module.scss';

const icons: { name: string; Icon: ComponentType<IconProps> }[] = [
  { name: 'ChevronDownIcon', Icon: ChevronDownIcon },
  { name: 'ChevronUpIcon', Icon: ChevronUpIcon },
  { name: 'ArrowForwardIcon', Icon: ArrowForwardIcon },
  { name: 'ArrowBackIcon', Icon: ArrowBackIcon },
  { name: 'CloseIcon', Icon: CloseIcon },
  { name: 'SearchIcon', Icon: SearchIcon },
  { name: 'HeartIcon', Icon: HeartIcon },
  { name: 'HeartFilledIcon', Icon: HeartFilledIcon },
  { name: 'StarIcon', Icon: StarIcon },
  { name: 'CheckIcon', Icon: CheckIcon },
  { name: 'CartIcon', Icon: CartIcon },
  { name: 'ClockIcon', Icon: ClockIcon },
  { name: 'MapPinIcon', Icon: MapPinIcon },
  { name: 'InfoIcon', Icon: InfoIcon },
  { name: 'PlusIcon', Icon: PlusIcon },
  { name: 'MinusIcon', Icon: MinusIcon },
];

// Every icon at both sizes. The icons take the colour of the text around them (currentColor).
export function IconsSection() {
  return (
    <>
      <p className={styles.caption}>
        16 и 24px, цвет берётся из текста (currentColor). Без подписи рядом иконке нужен title.
      </p>
      <ul className={styles.grid}>
        {icons.map(({ name, Icon }) => (
          <li key={name} className={styles.item}>
            <span className={styles.samples}>
              <Icon size={16} />
              <Icon size={24} />
            </span>
            <code className={styles.name}>{name}</code>
          </li>
        ))}
      </ul>
    </>
  );
}
