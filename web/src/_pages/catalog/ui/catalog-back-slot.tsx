import styles from './catalog-page.module.scss';

// The arrow's place alone, as wide as `CatalogBack`'s: the page's placeholders hold nothing to use
// and no script (plan §1, AC17), so this is not a client component.
export function CatalogBackSlot() {
  return <div className={styles.back} />;
}
