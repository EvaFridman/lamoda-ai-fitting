'use client';

import dynamic from 'next/dynamic';

// Agentation's toolbar for the owner's notes on the UI, in `next dev` only: the condition is
// inlined at build time, so the production bundle holds neither the import nor the package. With
// no `endpoint` or `webhookUrl` it keeps the notes in `localStorage` and sends nothing, as long as
// its settings' "Webhook URL" stays empty (no prop turns that field off); they reach the agent only
// by "Copy".
export const DevAnnotations =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('agentation').then((module) => module.Agentation), { ssr: false })
    : () => null;
