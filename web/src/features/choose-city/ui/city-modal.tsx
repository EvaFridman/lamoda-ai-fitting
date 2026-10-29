'use client';

import { useEffect, useRef, useState } from 'react';

import { type City, matchCities } from '@/entities/store';
import { useTrackedElement, useTrackedElements } from '@/shared/analytics';
import { errorText } from '@/shared/api';
import { Button, CheckIcon, Modal, type ModalProps, SearchField } from '@/shared/ui';

import { chooseCity, untouchedSince, useCity } from '../model/city-store';
import { findCity } from '../model/find-city';
import styles from './city-modal.module.scss';

// C7's texts after «Определить автоматически» (C14: «запрещён» without «в браузере»).
const LOCATE_TEXTS = {
  far: 'Рядом с вами пока нет магазинов',
  refused: 'Доступ к геопозиции запрещён',
  failed: 'Не удалось определить местоположение',
} as const;

type Locating = 'idle' | 'finding' | keyof typeof LOCATE_TEXTS;

export interface CityModalProps {
  // The stores' cities; `null` when the read failed, `failure` then says how.
  cities: readonly City[] | null;
  failure?: unknown;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus?: ModalProps['finalFocus'];
}

/**
 * The window «Ваш город» (spec 0026 plan §3.3, C4): «Определить автоматически», a search and the
 * list of the stores' cities; a pick or a found city closes it. The whole screen on phones.
 */
export function CityModal({ cities, failure, open, onOpenChange, finalFocus }: CityModalProps) {
  return (
    <Modal title="Ваш город" wide open={open} onOpenChange={onOpenChange} finalFocus={finalFocus}>
      {cities === null ? (
        <p className={styles.failure}>{errorText(failure)}</p>
      ) : (
        <CityChoice cities={cities} onChosen={() => onOpenChange(false)} />
      )}
    </Modal>
  );
}

// A body of its own, so the search and the last result start afresh with each opening.
function CityChoice({ cities, onChosen }: { cities: readonly City[]; onChosen: () => void }) {
  const city = useCity(cities);
  const hadCity = typeof city === 'string';
  const [text, setText] = useState('');
  const [locating, setLocating] = useState<Locating>('idle');
  const autoEvents = useTrackedElement('city.auto', { had_city: hadCity });
  const pickEvents = useTrackedElements('city.pick');
  const shown = matchCities(cities, text);

  // A result that comes after this opening closed only chooses the city: it must not close or
  // change a later opening.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const locate = async () => {
    autoEvents.onClick();
    setLocating('finding');
    const untouched = untouchedSince();
    const result = await findCity(cities, 'button');
    if (result.kind !== 'found') {
      if (mountedRef.current) setLocating(result.kind);
      return;
    }
    // A city chosen meanwhile (the page's own ask, another tab) wins and is shown (C8).
    if (untouched()) chooseCity(result.name);
    if (!mountedRef.current) return;
    setLocating('idle');
    onChosen();
  };

  return (
    <div className={styles.body}>
      <div className={styles.auto}>
        <Button
          variant="secondary"
          fullWidth
          loading={locating === 'finding'}
          onPointerEnter={autoEvents.onPointerEnter}
          onPointerLeave={autoEvents.onPointerLeave}
          onClick={() => void locate()}
        >
          Определить автоматически
        </Button>
        <p role="status" className={styles.status}>
          {locating === 'idle' || locating === 'finding' ? '' : LOCATE_TEXTS[locating]}
        </p>
      </div>
      <SearchField label="Найти город" placeholder="Найти город" onValueChange={setText} />
      {shown.length === 0 ? (
        <p className={styles.empty}>Ничего не нашлось</p>
      ) : (
        <ul className={styles.list}>
          {shown.map(({ name }) => {
            const events = pickEvents({ searched: text.trim() !== '', had_city: hadCity });
            const chosen = name === city;
            return (
              <li key={name}>
                <button
                  type="button"
                  className={styles.row}
                  aria-current={chosen ? 'true' : undefined}
                  onPointerEnter={events.onPointerEnter}
                  onPointerLeave={events.onPointerLeave}
                  onClick={() => {
                    events.onClick();
                    chooseCity(name);
                    onChosen();
                  }}
                >
                  <span className={styles.name}>{name}</span>
                  {chosen && <CheckIcon aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
