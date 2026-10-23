'use client';

import { useState } from 'react';

import { CameraIcon, FileInput, UploadIcon } from '@/shared/ui';

import styles from './examples.module.scss';

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';

// The live example: the chosen file's type and size are shown under the buttons, its name is not
// (a visitor's file name may be personal). Nothing is sent.
export function FileInputDemo() {
  const [chosen, setChosen] = useState<File | null>(null);

  return (
    <>
      <ul className={styles.row}>
        <li className={styles.example}>
          <FileInput accept={PHOTO_TYPES} onFileChange={setChosen}>
            <UploadIcon size={16} /> Загрузить фото
          </FileInput>
          <code className={styles.props}>accept</code>
        </li>
        <li className={styles.example}>
          <FileInput accept={PHOTO_TYPES} capture="user" variant="outline" onFileChange={setChosen}>
            <CameraIcon size={16} /> Сделать фото
          </FileInput>
          <code className={styles.props}>capture=&quot;user&quot; variant=&quot;outline&quot;</code>
        </li>
        <li className={styles.example}>
          <FileInput accept={PHOTO_TYPES} loading onFileChange={setChosen}>
            Загрузить фото
          </FileInput>
          <code className={styles.props}>loading</code>
        </li>
        <li className={styles.example}>
          <FileInput accept={PHOTO_TYPES} disabled onFileChange={setChosen}>
            Загрузить фото
          </FileInput>
          <code className={styles.props}>disabled</code>
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
