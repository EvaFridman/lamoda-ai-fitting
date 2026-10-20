'use client';

import {
  Button,
  IconButton,
  Menu,
  MenuHeader,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  ProfileIcon,
  showToast,
} from '@/shared/ui';

import styles from './examples.module.scss';

// The menus of the section; an item that runs shows a toast, since a demo has nothing to do. The
// links lead to the page's own sections.
export function MenuDemo() {
  return (
    <ul className={styles.row}>
      <li className={styles.example}>
        <Menu trigger={<Button variant="outline">Действия с заказом</Button>}>
          <MenuItem onClick={() => showToast({ title: 'Заказ повторён' })}>
            Повторить заказ
          </MenuItem>
          <MenuItem onClick={() => showToast({ title: 'Чек отправлен на почту' })}>
            Отправить чек
          </MenuItem>
          <MenuItem disabled>Вернуть товар</MenuItem>
        </Menu>
        <code className={styles.props}>MenuItem, disabled</code>
      </li>
      <li className={styles.example}>
        <Menu
          trigger={
            <IconButton aria-label="Профиль">
              <ProfileIcon />
            </IconButton>
          }
          align="end"
        >
          <MenuHeader>Профиль</MenuHeader>
          <MenuItem disabled>Мои заказы</MenuItem>
          <MenuItem disabled>Магазины</MenuItem>
          <MenuItem disabled>Мои данные</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => showToast({ title: 'Вы вышли' })}>Выйти</MenuItem>
        </Menu>
        <code className={styles.props}>align=&quot;end&quot;, MenuHeader, MenuSeparator</code>
      </li>
      <li className={styles.example}>
        <Menu trigger={<Button variant="outline">Разделы страницы</Button>}>
          <MenuLinkItem href="#tokens">Токены</MenuLinkItem>
          <MenuLinkItem href="#buttons">Кнопки</MenuLinkItem>
          <MenuLinkItem href="#links">Ссылки</MenuLinkItem>
        </Menu>
        <code className={styles.props}>MenuLinkItem</code>
      </li>
    </ul>
  );
}
