'use client';

import { useEffect, useRef, useState } from 'react';

import { Button, CheckboxFilterPanel, Drawer, DrawerClose, LinkButton } from '@/shared/ui';

import { colorOptions } from '../config/filters';

import styles from './examples.module.scss';

// A bottom sheet of the full height with two screens, as the phone filters' sheet: the list with
// its ×, and a screen with "‹", "Сбросить" on the right and no ×. Closing drops the screen.
export function SheetScreensDemo() {
  const [screen, setScreen] = useState<'list' | 'color'>('list');
  const [colors, setColors] = useState<string[]>([]);
  const backRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const switchedRef = useRef(false);

  // The control that opened the screen is gone: the focus goes to "‹", and back to the row.
  useEffect(() => {
    if (!switchedRef.current) return;
    switchedRef.current = false;
    (screen === 'color' ? backRef : rowRef).current?.focus();
  }, [screen]);

  function show(next: 'list' | 'color') {
    switchedRef.current = true;
    setScreen(next);
  }

  return (
    <Drawer
      trigger={<Button variant="outline">Шторка с экранами</Button>}
      side="bottom"
      fullHeight
      title={screen === 'list' ? 'Фильтры' : 'Цвет'}
      onOpenChangeComplete={(open) => {
        if (!open) setScreen('list');
      }}
      {...(screen === 'color'
        ? {
            onBack: () => show('list'),
            backLabel: 'Назад к фильтрам',
            backRef,
            closable: false,
            headerAction: <LinkButton onClick={() => setColors([])}>Сбросить</LinkButton>,
            footer: (
              <Button fullWidth onClick={() => show('list')}>
                Применить
              </Button>
            ),
          }
        : {
            footer: (
              <DrawerClose>
                <Button fullWidth>Показать 128 товаров</Button>
              </DrawerClose>
            ),
          })}
    >
      {screen === 'list' ? (
        <Button ref={rowRef} variant="outline" fullWidth onClick={() => show('color')}>
          Цвет{colors.length > 0 ? `: ${colors.length}` : ''}
        </Button>
      ) : (
        <CheckboxFilterPanel
          label="Цвет"
          layout="sheet"
          options={colorOptions}
          value={colors}
          onValueChange={setColors}
          swatches
          searchable
          selectAll
        />
      )}
      <p className={styles.props}>{JSON.stringify({ screen, colors })}</p>
    </Drawer>
  );
}
