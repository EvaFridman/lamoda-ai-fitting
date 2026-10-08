'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import type { ReactNode } from 'react';

import styles from './color-swatch.module.scss';

// Lamoda's colour filter palette, in its order; each has a token --color-swatch-<name> (D7o).
export const swatchColors = [
  'black',
  'gray',
  'white',
  'beige',
  'red',
  'pink',
  'orange',
  'multicolor',
  'yellow',
  'green',
  'navy-blue',
  'blue',
  'purple',
  'vinous',
  'coral',
  'turquoise',
  'fuchsia',
  'gold',
  'silver',
  'khaki',
  'brown',
  'transparent',
] as const;

export type SwatchColor = (typeof swatchColors)[number];

// The colours Lamoda inverts the tick on: a white tick would not show on them.
const light = new Set<SwatchColor>([
  'gray',
  'white',
  'beige',
  'pink',
  'orange',
  'yellow',
  'blue',
  'gold',
  'silver',
  'transparent',
]);

// The colours that would merge with the white page without a border.
const bordered = new Set<SwatchColor>(['white', 'transparent']);

export interface ColorSwatchProps extends Omit<
  BaseCheckbox.Root.Props,
  'className' | 'style' | 'render' | 'children' | 'indeterminate' | 'parent' | 'nativeButton'
> {
  color: SwatchColor;
  // The colour's name; with the count it is the checkbox's accessible name.
  children: ReactNode;
  // The number of products in this colour, grey on the right.
  count?: number;
  className?: string;
}

// A row of the colour filter, as in Lamoda's FilterValue: an 18px round swatch in place of the
// checkbox, the name and the count, the whole row clickable through the enclosing <label>. Base
// UI renders the swatch as role="checkbox" with aria-checked; a ticked swatch shows a white tick,
// black on light colours. Picks several colours inside a CheckboxGroup.
export function ColorSwatch({ color, children, count, className, ...root }: ColorSwatchProps) {
  return (
    <label className={[styles.colorSwatch, className].filter(Boolean).join(' ')}>
      <BaseCheckbox.Root
        className={styles.swatch}
        style={{ background: `var(--color-swatch-${color})` }}
        data-light={light.has(color) || undefined}
        data-bordered={bordered.has(color) || undefined}
        {...root}
      >
        <BaseCheckbox.Indicator className={styles.tick} />
      </BaseCheckbox.Root>
      <span className={styles.label}>{children}</span>
      {count === undefined ? null : <span className={styles.count}>{count}</span>}
    </label>
  );
}
