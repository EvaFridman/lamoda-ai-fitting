import { sections } from './sections';
import styles from './ui-kit-page.module.scss';

// The kit's showcase: no api data, so next build prerenders it whole.
export function UiKitPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.toc} aria-label="Содержание">
        <ul className={styles.tocList}>
          {sections.map(({ id, title }) => (
            <li key={id}>
              <a className={styles.tocLink} href={`#${id}`}>
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className={styles.content}>
        <h1 className={styles.title}>UI-kit</h1>
        {sections.map(({ id, title, Content }) => (
          <section key={id} id={id} className={styles.section} aria-labelledby={`${id}-title`}>
            <h2 id={`${id}-title`} className={styles.sectionTitle}>
              {title}
            </h2>
            <Content />
          </section>
        ))}
      </div>
    </main>
  );
}
