import type { ComponentType } from 'react';

import {
  ArrowBackIcon,
  ArrowForwardIcon,
  BagIcon,
  CameraIcon,
  CartIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  CloseIcon,
  CompareIcon,
  DownloadIcon,
  FullscreenIcon,
  HangerIcon,
  HeartFilledIcon,
  HeartIcon,
  type IconProps,
  InfoIcon,
  LockIcon,
  MapPinIcon,
  MinusIcon,
  PhoneIcon,
  PlusIcon,
  ProfileIcon,
  RefreshIcon,
  SearchIcon,
  SparkleIcon,
  StarIcon,
  UploadIcon,
  VkIcon,
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
  { name: 'BagIcon', Icon: BagIcon },
  { name: 'ProfileIcon', Icon: ProfileIcon },
  { name: 'ClockIcon', Icon: ClockIcon },
  { name: 'MapPinIcon', Icon: MapPinIcon },
  { name: 'InfoIcon', Icon: InfoIcon },
  { name: 'PlusIcon', Icon: PlusIcon },
  { name: 'MinusIcon', Icon: MinusIcon },
  { name: 'VkIcon', Icon: VkIcon },
  { name: 'PhoneIcon', Icon: PhoneIcon },
  { name: 'HangerIcon', Icon: HangerIcon },
  { name: 'SparkleIcon', Icon: SparkleIcon },
  { name: 'CameraIcon', Icon: CameraIcon },
  { name: 'UploadIcon', Icon: UploadIcon },
  { name: 'DownloadIcon', Icon: DownloadIcon },
  { name: 'FullscreenIcon', Icon: FullscreenIcon },
  { name: 'RefreshIcon', Icon: RefreshIcon },
  { name: 'LockIcon', Icon: LockIcon },
  { name: 'CompareIcon', Icon: CompareIcon },
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
