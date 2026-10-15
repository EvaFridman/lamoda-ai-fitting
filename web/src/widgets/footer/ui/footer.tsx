import { connection } from 'next/server';
import { Suspense } from 'react';

import { getServerEnv } from '@/shared/config/server';
import { Link, MastercardMark, PhoneIcon, VisaMark, VkIcon } from '@/shared/ui';

import { footerColumns } from '../config/items';
import styles from './footer.module.scss';

// The version is read at request time: read during prerendering, the build's value would be
// baked into the static shell forever.
async function AppVersion() {
  await connection();
  return <>версия {getServerEnv().APP_VERSION}</>;
}

// Lamoda's site footer (spec 0008 J22, J36): four columns of items, then a bottom row with VK, the
// card marks, "Мобильная версия" and the deployed version. Only items with a page are links.
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.columns}>
          {footerColumns.map((column) => (
            <section key={column.title}>
              <h2 className={styles.title}>{column.title}</h2>
              <ul className={styles.list}>
                {column.items.map((item) => (
                  <li key={item.label} className={styles.item}>
                    {item.href ? (
                      <Link href={item.href} className={styles.link}>
                        {item.label}
                      </Link>
                    ) : (
                      item.label
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className={styles.bottom}>
          <VkIcon title="VK" className={styles.vk} />
          <div>
            <div className={styles.marks}>
              <MastercardMark title="Mastercard" />
              <VisaMark title="Visa" />
            </div>
            {/* Underlined as on Lamoda, but not a link: the page does not exist (J22). */}
            <p className={styles.payment}>
              Доступны <span className={styles.underline}>другие способы оплаты</span>
            </p>
          </div>
          <span className={styles.mobile}>
            <PhoneIcon />
            Мобильная версия
          </span>
          <span className={styles.version}>
            <Suspense fallback={null}>
              <AppVersion />
            </Suspense>
          </span>
        </div>
      </div>
    </footer>
  );
}
