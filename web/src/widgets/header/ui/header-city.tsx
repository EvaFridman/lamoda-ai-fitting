'use client';

import { useRef, useState } from 'react';

import type { City } from '@/entities/store';
import { CityModal, useCity, useCityOpenEvents } from '@/features/choose-city';

import { NO_CITY_TEXT } from './city-text';
import styles from './header.module.scss';

// The header's city (spec 0026 plan §4, AC1, AC2): the chosen city's name, else the placeholder
// (also before hydration, a short flash for a visitor with a city), opening «Ваш город».
export function HeaderCity({ cities }: { cities: readonly City[] | null }) {
  const city = useCity(cities);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const events = useCityOpenEvents('header', cities);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.textButton} ${styles.city}`}
        onClick={() => {
          events.onClick();
          setOpen(true);
        }}
        onPointerEnter={events.onPointerEnter}
        onPointerLeave={events.onPointerLeave}
      >
        {city ?? NO_CITY_TEXT}
      </button>
      <CityModal
        cities={cities}
        open={open}
        onOpenChange={setOpen}
        finalFocus={() => buttonRef.current}
      />
    </>
  );
}
