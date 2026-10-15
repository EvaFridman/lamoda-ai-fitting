'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import type { ReactNode } from 'react';

import { COLOR_HEX } from '@/shared/lib';

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

// An attribute value's colour from the api, #RRGGBB in any case (COLOR_HEX).
export type HexColor = `#${string}`;

// A hex colour above this relative luminance would merge with the white page without a border.
const borderedLuminance = 0.9;

// WCAG relative luminance of a #RRGGBB colour, from 0 (black) to 1 (white).
function relativeLuminance(hex: HexColor): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

interface SwatchLook {
  background?: string;
  light: boolean;
  bordered: boolean;
}

// A token keeps Lamoda's hand-made sets (D7o): they follow no single luminance threshold. A hex
// gets the tick that contrasts more with it (black when its WCAG contrast with black is higher)
// and a border when it is near white. Anything else (no colour, a hex that is not #RRGGBB, a
// string cast to a token) is an empty bordered circle on the white page, so the tick on it is
// black; it never reaches the style.
function swatchLook(color: SwatchColor | HexColor | undefined): SwatchLook {
  if (color !== undefined && isHexColor(color)) {
    const luminance = relativeLuminance(color);
    return {
      background: color,
      light: (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05),
      bordered: luminance > borderedLuminance,
    };
  }
  if (color !== undefined && isSwatchColor(color)) {
    return {
      background: `var(--color-swatch-${color})`,
      light: light.has(color),
      bordered: bordered.has(color),
    };
  }
  return { light: true, bordered: true };
}

function isHexColor(color: string): color is HexColor {
  return COLOR_HEX.test(color);
}

function isSwatchColor(color: string): color is SwatchColor {
  return (swatchColors as readonly string[]).includes(color);
}

export interface ColorSwatchProps extends Omit<
  BaseCheckbox.Root.Props,
  'className' | 'style' | 'render' | 'children' | 'indeterminate' | 'parent' | 'nativeButton'
> {
  // A palette token, an attribute value's hex, or none: an empty bordered circle.
  color?: SwatchColor | HexColor;
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
  const look = swatchLook(color);
  return (
    <label className={[styles.colorSwatch, className].filter(Boolean).join(' ')}>
      <BaseCheckbox.Root
        className={styles.swatch}
        style={look.background === undefined ? undefined : { background: look.background }}
        data-light={look.light || undefined}
        data-bordered={look.bordered || undefined}
        {...root}
      >
        <BaseCheckbox.Indicator className={styles.tick} />
      </BaseCheckbox.Root>
      <span className={styles.label}>{children}</span>
      {count === undefined ? null : <span className={styles.count}>{count}</span>}
    </label>
  );
}
