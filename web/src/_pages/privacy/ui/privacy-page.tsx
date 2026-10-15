import { CookieSettingsButton } from '@/features/cookie-consent';

import styles from './privacy-page.module.scss';

// Static: it builds into the shell. The text is a placeholder until the owner supplies the real one
// (spec 0008, J10, J34); the button renders only with an analytics token (J17).
export function PrivacyPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Политика по работе с персональными данными</h1>
      <p className={styles.text}>
        Здесь будет политика по работе с персональными данными. Текст готовится и появится позже.
        Пока сайт работает как демонстрация: аналитика включается, только если вы согласились в
        баннере о cookies, и это решение можно изменить кнопкой ниже.
      </p>
      <div>
        <CookieSettingsButton />
      </div>
    </main>
  );
}
