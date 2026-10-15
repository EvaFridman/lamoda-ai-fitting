'use client';

import { useEffect } from 'react';

import { startAnalytics, stopAnalytics, useHoverReset } from '@/shared/analytics';

import { useConsent } from '../model/consent-store';

// No markup: starts analytics once consent is given and stops it when it is taken back (J16);
// anything but "granted" counts as no (J10). Also starts a new page view for hovers on every
// navigation, since it is mounted once for the whole app (plan §3).
export function AnalyticsGate() {
  useHoverReset();
  const consent = useConsent();
  useEffect(() => {
    // `unknown` (the server, hydration) is not an answer yet: stopping then would clear the SDK's
    // storage on every page load of a visitor who agreed (J32).
    if (consent === 'granted') void startAnalytics();
    else if (consent !== 'unknown') stopAnalytics();
  }, [consent]);
  return null;
}
