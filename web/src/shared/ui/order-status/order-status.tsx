import styles from './order-status.module.scss';

export type OrderStatusTone = 'primary' | 'success' | 'warning' | 'caution' | 'secondary';

export interface OrderStatusProps {
  // The status as the visitor reads it: "Доставлен", "Не выкуплен".
  title: string;
  // The date as text, written by the page: "5 октября", "31 июля 2024 года" (D7u).
  date?: string;
  // `primary` black, `success` green, `warning` red, `caution` orange, `secondary` grey. The page
  // maps an order's status code to a title and a tone.
  tone?: OrderStatusTone;
  className?: string;
}

// The status line of Lamoda's order card (D5b): the status in 20px coloured by its tone, then the
// date in grey, 5px apart; the date wraps under the status when the line is too narrow.
export function OrderStatus({ title, date, tone = 'primary', className }: OrderStatusProps) {
  return (
    <p className={[styles.status, className].filter(Boolean).join(' ')}>
      <span className={styles[tone]}>{title}</span>
      {date ? (
        <>
          {' '}
          <span className={styles.date}>{date}</span>
        </>
      ) : null}
    </p>
  );
}
