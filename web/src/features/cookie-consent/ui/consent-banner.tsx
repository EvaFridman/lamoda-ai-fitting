'use client';

import { useEffect, useRef } from 'react';

import { analyticsEnabled } from '@/shared/config';
import { Button, Link } from '@/shared/ui';

import {
  answerConsent,
  takeFocusOnShow,
  useConsentAsking,
  useReopenings,
} from '../model/consent-store';

import styles from './consent-banner.module.scss';

// A bar at the bottom of the screen with two buttons of equal weight, so declining is as easy as
// accepting (J21). Not shown with an empty token: there is nothing to ask about (J17). It comes
// first in the DOM (`_app/providers.tsx`), so it is the first Tab stop, and a keyboard user who
// answers it goes on from the top of the page. Reopened by "Настройки cookies", the bar itself
// takes the focus, not a button: Enter pressed without looking must not answer for the visitor.
export function ConsentBanner() {
  const asking = useConsentAsking();
  const reopenings = useReopenings();
  const shown = analyticsEnabled && asking;
  const bannerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (shown && takeFocusOnShow()) bannerRef.current?.focus();
  }, [shown, reopenings]);

  if (!shown) return null;
  return (
    <section
      ref={bannerRef}
      tabIndex={-1}
      className={styles.banner}
      aria-label="Согласие на cookies"
    >
      <p className={styles.text}>
        Мы используем cookies для аналитики, чтобы улучшать сайт. Аналитика включится, только если
        вы согласитесь. <Link href="/privacy">Политика по работе с персональными данными</Link>
      </p>
      <div className={styles.actions}>
        <Button size={40} className={styles.button} onClick={() => answerConsent('granted')}>
          Принять
        </Button>
        <Button size={40} className={styles.button} onClick={() => answerConsent('denied')}>
          Отказаться
        </Button>
      </div>
    </section>
  );
}
