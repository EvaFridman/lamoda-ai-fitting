import type { Metadata } from 'next';

// Indexed like any page (spec 0008, plan §5).
export const metadata: Metadata = {
  title: { absolute: 'Политика по работе с персональными данными — Lamoda AI Fitting' },
};

export { PrivacyPage as default } from '@/_pages/privacy';
