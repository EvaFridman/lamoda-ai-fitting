import styles from './stores-map.module.scss';

// Lamoda's map pin (spec 0022 X5, X9): a black drop whose tip is the store's point, «la» in white
// on its round part, the first two letters of the «lamoda sport» wordmark
// (`_pages/stores/ui/logos.tsx`). Decorative: the marker's button names the store.
export function StorePin() {
  return (
    <svg className={styles.pinIcon} viewBox="0 0 32 40" aria-hidden="true" focusable="false">
      <path d="M16 40 4.07 26.67A16 16 0 1 1 27.93 26.67Z" fill="currentColor" />
      <g transform="translate(5.95 8)" fill="#fff" fillRule="evenodd" clipRule="evenodd">
        <path d="M3.2666 15.6406H0V0H3.2666V15.6406Z" />
        <path d="M12.5137 2.9043C14.4996 2.90443 16.045 3.73147 16.8174 5.00488H16.8838V3.2627H20.1055V15.6406H16.8838V13.8984H16.8174C16.0449 15.1717 14.4994 15.9979 12.5137 15.998C8.7622 15.9979 6.40049 13.2941 6.40039 9.45117C6.40052 5.6083 8.76223 2.90446 12.5137 2.9043ZM13.3301 5.58594C10.6818 5.58595 9.73242 6.81459 9.73242 9.45117C9.73248 12.0876 10.6819 13.3164 13.3301 13.3164C15.9779 13.3163 16.9277 12.0874 16.9277 9.45117C16.9277 6.81475 15.978 5.58609 13.3301 5.58594Z" />
      </g>
    </svg>
  );
}
