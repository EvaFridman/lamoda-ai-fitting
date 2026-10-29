'use client';

import { type DragEvent, useState } from 'react';

import { DropCard, DropCardPicker } from '@/features/upload-photo';
import { CameraIcon, UploadIcon } from '@/shared/ui';

import styles from './examples.module.scss';

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';

// The try-on's empty drop zone (spec 0024 Z17) at the frame's proportions: the live card with a
// mouse (a click anywhere or «Выбрать файл» picks a file, a file dragged over it greys it; a
// dropped or chosen one shows only its type and size), the same card held in its dragging look,
// and the touch device's tiles. Nothing is sent.
export function DropCardDemo() {
  const [chosen, setChosen] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: DragEvent) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) setChosen(file);
    },
  };

  const area = (
    <DropCardPicker
      kind="area"
      accept={PHOTO_TYPES}
      onFileChange={setChosen}
      aria-label="Загрузить фото"
      tabIndex={-1}
      aria-hidden
    >
      {null}
    </DropCardPicker>
  );
  const link = (
    <DropCardPicker kind="link" accept={PHOTO_TYPES} onFileChange={setChosen}>
      Выбрать файл
    </DropCardPicker>
  );

  return (
    <>
      <ul className={styles.row}>
        <li className={styles.example}>
          <div className={styles.dropFrame} {...dropHandlers}>
            <DropCard dragging={dragging} area={area} actions={link} />
          </div>
          <code className={styles.props}>мышь: перетащите файл</code>
        </li>
        <li className={styles.example}>
          <div className={styles.dropFrame}>
            <DropCard dragging area={area} actions={link} />
          </div>
          <code className={styles.props}>dragging</code>
        </li>
        <li className={styles.example}>
          <div className={styles.dropFrame}>
            <DropCard
              touch
              area={area}
              actions={
                <>
                  <DropCardPicker kind="tile" accept={PHOTO_TYPES} onFileChange={setChosen}>
                    <UploadIcon />
                    <span>Загрузить фото</span>
                  </DropCardPicker>
                  <DropCardPicker
                    kind="tile"
                    accept={PHOTO_TYPES}
                    capture="user"
                    onFileChange={setChosen}
                  >
                    <CameraIcon />
                    <span>Сделать фото</span>
                  </DropCardPicker>
                </>
              }
            />
          </div>
          <code className={styles.props}>touch</code>
        </li>
      </ul>
      <p className={styles.props} aria-live="polite">
        {chosen
          ? `Выбран файл ${chosen.type || 'неизвестного типа'}, ${Math.ceil(chosen.size / 1024)} КБ`
          : 'Файл не выбран'}
      </p>
    </>
  );
}
