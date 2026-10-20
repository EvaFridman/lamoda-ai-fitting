import styles from './examples.module.scss';
import { MenuDemo } from './menu-demo';

// The kit's menu. It opens live only, like Select (D7q): Base UI moves the focus into a menu as it
// opens, so a menu open on load would take the focus as the page loads.
export function MenuSection() {
  return (
    <>
      <p className={styles.caption}>
        Меню открывается вживую: клик, Enter, пробел или стрелка вниз. Стрелки двигают выделение, в
        том числе по недоступным пунктам, Enter выбирает пункт, Esc или клик мимо закрывают меню, и
        фокус возвращается на кнопку. Пункт-ссылка (MenuLinkItem) по Enter или клику открывает
        страницу и закрывает меню.
      </p>

      <h3 className={styles.heading}>Menu</h3>
      <MenuDemo />
    </>
  );
}
