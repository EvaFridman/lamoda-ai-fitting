'use client';

import { useRef, useState } from 'react';

import { Button, CheckboxFilterPanel, Drawer, DrawerClose, LinkButton } from '@/shared/ui';

import { colorOptions } from '../config/filters';

import styles from './examples.module.scss';

// A bottom sheet of the full height with a screen nested in it, as the phone filters' sheet (spec
// 0020 W30): the list with its ×, and over it a second sheet with "‹", "Сбросить" on the right and
// no ×, while the list steps back behind it. Escape or "‹" closes the screen alone; the focus goes
// to "‹" and back to the row.
export function SheetScreensDemo() {
  const [screenOpen, setScreenOpen] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const backRef = useRef<HTMLButtonElement>(null);

  return (
    <Drawer
      trigger={<Button variant="outline">Шторка с экранами</Button>}
      side="bottom"
      fullHeight
      title="Фильтры"
      onOpenChangeComplete={(open) => {
        if (!open) setScreenOpen(false);
      }}
      footer={
        <DrawerClose>
          <Button fullWidth>Показать 128 товаров</Button>
        </DrawerClose>
      }
    >
      <Drawer
        side="bottom"
        fullHeight
        title="Цвет"
        open={screenOpen}
        onOpenChange={setScreenOpen}
        onBack={() => setScreenOpen(false)}
        backLabel="Назад к фильтрам"
        backRef={backRef}
        initialFocus={backRef}
        closable={false}
        headerAction={<LinkButton onClick={() => setColors([])}>Сбросить</LinkButton>}
        footer={
          <Button fullWidth onClick={() => setScreenOpen(false)}>
            Применить
          </Button>
        }
      >
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
      </Drawer>
      <Button variant="outline" fullWidth onClick={() => setScreenOpen(true)}>
        Цвет{colors.length > 0 ? `: ${colors.length}` : ''}
      </Button>
      <p className={styles.props}>{JSON.stringify({ screenOpen, colors })}</p>
    </Drawer>
  );
}
