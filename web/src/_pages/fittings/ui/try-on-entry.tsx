'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { TryOn } from '@/widgets/try-on';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(value: string | null): string | undefined {
  return value !== null && UUID.test(value) ? value : undefined;
}

// `?fitting=<id>` opens that fitting in the try-on window at once: the toast's «Открыть», the
// history's cards and the product page's «Вы это примеряли» lead here (spec 0019 A77.6, A78, A82).
// A new try-on starts from the product page (T20).
export function TryOnEntry() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const fittingId = uuidParam(params.get('fitting'));
  const [open, setOpen] = useState(fittingId !== undefined);
  const [openedFitting, setOpenedFitting] = useState(fittingId);

  // Another fitting's link while this page is open (a second toast) opens it.
  if (fittingId !== openedFitting) {
    setOpenedFitting(fittingId);
    if (fittingId !== undefined) setOpen(true);
  }

  if (!open || openedFitting === undefined) return null;

  return (
    <TryOn
      // Another fitting's link opens a new window, not the state of the one shown.
      key={openedFitting}
      fittingId={openedFitting}
      onClose={() => {
        setOpen(false);
        // The fitting leaves the address: a later link to it (its toast) opens it again.
        if (fittingId !== undefined) {
          const rest = new URLSearchParams(params.toString());
          rest.delete('fitting');
          const query = rest.toString();
          router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
        }
      }}
    />
  );
}
