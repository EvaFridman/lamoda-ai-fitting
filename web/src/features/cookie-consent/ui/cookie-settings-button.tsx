'use client';

import { analyticsEnabled } from '@/shared/config';
import { Button } from '@/shared/ui';

import { reopenConsent } from '../model/consent-store';

// "Настройки cookies" on the policy page shows the banner again (J16). With an empty token there is
// no banner to show, so no button either (J17).
export function CookieSettingsButton() {
  if (!analyticsEnabled) return null;
  return (
    <Button variant="outline" size={40} onClick={() => reopenConsent()}>
      Настройки cookies
    </Button>
  );
}
