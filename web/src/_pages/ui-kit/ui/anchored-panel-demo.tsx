'use client';

import { useRef, useState } from 'react';

import { AnchoredPanel, Button } from '@/shared/ui';

// The panel rising over its button, as the try-on result's «Что поменять?» (spec 0024 R13): the
// placer's own button opens it through `open`, and the focus comes back to it.
export function AnchoredPanelDemo() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button ref={anchorRef} variant="secondary" onClick={() => setOpen(true)}>
        Хотите что-то поменять?
      </Button>
      <AnchoredPanel
        title="Что поменять?"
        anchor={anchorRef}
        open={open}
        onOpenChange={setOpen}
        footer={
          <Button fullWidth onClick={() => setOpen(false)}>
            Готово
          </Button>
        }
      >
        <p>Панель поднимается над кнопкой, остальное окно затемнено.</p>
      </AnchoredPanel>
    </>
  );
}
