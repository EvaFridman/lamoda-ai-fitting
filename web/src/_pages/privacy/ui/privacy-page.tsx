import { CookieSettingsButton } from '@/features/cookie-consent';

import styles from './privacy-page.module.scss';

// Static: it builds into the shell. The text is a placeholder until the owner supplies the real one
// (spec 0008, J10, J34), with a line about the Google account data kept at sign-in (spec 0013
// plan §10); the button renders only with an analytics token (J17).
export function PrivacyPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Политика по работе с персональными данными</h1>
      <p className={styles.text}>
        Здесь будет политика по работе с персональными данными. Текст готовится и появится позже.
        Пока сайт работает как демонстрация: аналитика включается, только если вы согласились в
        баннере о cookies, и это решение можно изменить кнопкой ниже.
      </p>
      <p className={styles.text}>
        Если вы входите через Google, мы храним адрес почты и имя из вашего аккаунта Google, чтобы
        узнавать вас при следующем входе. Фотографию профиля мы не храним.
      </p>
      <p className={styles.text}>
        Для онлайн-примерки вы загружаете своё фото. Мы храним его без метаданных (места и времени
        съёмки) в разделе «Мои фото», где его видите только вы, вместе с результатами примерок. Для
        проверки фото и создания примерки фото передаётся в OpenAI (США); для обучения моделей фото
        не используются. Фото, загруженное без сохранения, удаляется после примерки или через час.
        Удалённое фото исчезает из хранилища в течение нескольких минут, а при удалении аккаунта
        удаляются все фото и результаты примерок. Резервные копии хранятся до 7 дней, затем
        удаляются и они.
      </p>
      <div>
        <CookieSettingsButton />
      </div>
    </main>
  );
}
