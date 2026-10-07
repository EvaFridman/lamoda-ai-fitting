import { colorGroups, fontWeights, shadows, spacing, typeScale } from '../config/tokens';

import styles from './tokens-section.module.scss';

// Every sample is painted by its token through var(--…), so the page shows what tokens.scss holds.
export function TokensSection() {
  return (
    <>
      <h3 className={styles.heading}>Цвета</h3>
      {colorGroups.map((group) => (
        <div key={group.title} className={styles.group}>
          <h4 className={styles.groupTitle}>{group.title}</h4>
          <ul className={styles.swatches}>
            {group.tokens.map(({ token, name, value }) => (
              <li key={token} className={styles.swatch}>
                <span className={styles.chip} style={{ background: `var(${token})` }} />
                <span>{name}</span>
                <code className={styles.meta}>{value}</code>
                <code className={styles.meta}>{token}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h3 className={styles.heading}>Типографика</h3>
      <ul className={styles.rows}>
        {typeScale.map(({ name, size, lineHeight }) => (
          <li key={name} className={styles.typeRow}>
            <span
              style={{
                fontSize: `var(--font-size-${name})`,
                lineHeight: `var(--line-height-${name})`,
              }}
            >
              Примерка образа
            </span>
            <code className={styles.meta}>
              {name} · {size}/{lineHeight}
            </code>
          </li>
        ))}
      </ul>
      <ul className={styles.rows}>
        {fontWeights.map(({ token, name, value }) => (
          <li key={token} className={styles.typeRow}>
            <span style={{ fontWeight: `var(${token})` }}>{name}</span>
            <code className={styles.meta}>
              {value} · {token}
            </code>
          </li>
        ))}
      </ul>

      <h3 className={styles.heading}>Отступы</h3>
      <ul className={styles.rows}>
        {spacing.map(({ token, value }) => (
          <li key={token} className={styles.spaceRow}>
            <span className={styles.space} style={{ width: `var(${token})` }} />
            <code className={styles.meta}>
              {value}px · {token}
            </code>
          </li>
        ))}
      </ul>

      <h3 className={styles.heading}>Тени</h3>
      <ul className={styles.shadows}>
        {shadows.map(({ token, name, value }) => (
          <li key={token} className={styles.shadow} style={{ boxShadow: `var(${token})` }}>
            <span>{name}</span>
            <code className={styles.meta}>{value}</code>
            <code className={styles.meta}>{token}</code>
          </li>
        ))}
      </ul>
    </>
  );
}
