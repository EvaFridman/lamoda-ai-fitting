'use client';

import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { Slider } from '@base-ui/react/slider';
import { type KeyboardEvent, useState } from 'react';

import { formatAmount, formatPrice } from '@/shared/lib';

import { Button } from '../button/button';
import { useFilterDropdown } from '../filter-dropdown/filter-dropdown';

import styles from './price-filter.module.scss';

export type PriceRange = [min: number, max: number];

export interface PriceFilterProps {
  // The bounds of the slider: the cheapest and the dearest product, in whole rubles.
  min: number;
  max: number;
  // The applied range; [min, max] when no price is applied.
  value: PriceRange;
  // Called by "Применить" with the chosen range; the dropdown closes.
  onApply: (value: PriceRange) => void;
}

const fieldLabels = ['Мин. цена', 'Макс. цена'] as const;

// The digits of a typed price, spaces and other characters dropped; null when there are none.
function parse(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

// What a field shows for a price: nothing at its bound, the price with its digit groups otherwise.
function shown(price: number, bound: number) {
  return price === bound ? '' : formatAmount(price);
}

// The content of a FilterDropdown: a two-thumb slider, the "Мин. цена" and "Макс. цена" fields and
// "Применить", disabled until the range differs from the applied one. The range is a draft until
// applied. A field at its bound is empty, the bound grey in its place (D7i); a typed price moves its
// thumb at once, and blur or Enter corrects the text (D7j). The fields are not TextField (D7l).
export function PriceFilter({ min, max, value, onApply }: PriceFilterProps) {
  const { label, close } = useFilterDropdown('PriceFilter');
  const bounds: PriceRange = [min, max];
  const [draft, setDraft] = useState<PriceRange>(value);
  const [texts, setTexts] = useState<[string, string]>(() => [
    shown(value[0], min),
    shown(value[1], max),
  ]);

  function move(next: PriceRange) {
    setDraft(next);
    setTexts([shown(next[0], min), shown(next[1], max)]);
  }

  // A typed price moves its thumb at once to where the correction puts it (D7j): the bound when the
  // field is empty or the price is out of the bounds, never past the other thumb. The draft is then
  // always what "Применить" applies, and the text is corrected on blur or Enter. Only digits and
  // spaces reach a field.
  function type(index: 0 | 1, typed: string) {
    const text = typed.replace(/[^\d\s]/g, '');
    setTexts(index === 0 ? [text, texts[1]] : [texts[0], text]);
    const price = Math.min(Math.max(parse(text) ?? bounds[index], min), max);
    setDraft(
      index === 0 ? [Math.min(price, draft[1]), draft[1]] : [draft[0], Math.max(price, draft[0])],
    );
  }

  function onEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') move(draft);
  }

  const changed = draft[0] !== value[0] || draft[1] !== value[1];

  function apply() {
    onApply(draft);
    close();
  }

  function priceField(index: 0 | 1) {
    return (
      <Field.Root className={styles.field}>
        <Field.Label className={styles.label}>{fieldLabels[index]}</Field.Label>
        <Input
          className={styles.input}
          inputMode="numeric"
          autoComplete="off"
          placeholder={formatAmount(bounds[index])}
          value={texts[index]}
          onValueChange={(text) => type(index, text)}
          onBlur={() => move(draft)}
          onKeyDown={onEnter}
        />
      </Field.Root>
    );
  }

  return (
    <div className={styles.priceFilter}>
      <div className={styles.body}>
        <Slider.Root
          aria-label={label}
          className={styles.slider}
          min={min}
          max={max}
          value={draft}
          onValueChange={(next) => move(next as PriceRange)}
          thumbCollisionBehavior="none"
        >
          <Slider.Control className={styles.control}>
            <Slider.Track className={styles.track}>
              <Slider.Indicator className={styles.indicator} />
              {([0, 1] as const).map((index) => (
                <Slider.Thumb
                  key={index}
                  index={index}
                  className={styles.thumb}
                  aria-label={fieldLabels[index]}
                  getAriaValueText={(_formatted, price) => formatPrice(price)}
                />
              ))}
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
        <div className={styles.fields}>
          {priceField(0)}
          <span className={styles.dash} aria-hidden>
            —
          </span>
          {priceField(1)}
        </div>
      </div>
      <div className={styles.footer}>
        <Button fullWidth disabled={!changed} onClick={apply}>
          Применить
        </Button>
      </div>
    </div>
  );
}
