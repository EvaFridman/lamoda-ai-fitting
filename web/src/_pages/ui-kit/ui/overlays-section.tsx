import {
  Button,
  Drawer,
  DrawerClose,
  HeartIcon,
  HelpTip,
  IconButton,
  Modal,
  ModalClose,
  SearchIcon,
  Tooltip,
} from '@/shared/ui';

import styles from './examples.module.scss';

// The modal, the drawer and the hints. They open live only, not on load (D7z): an open modal or
// drawer would take the focus and stop the page from scrolling, and a hint is a hover state (D11a).
export function OverlaysSection() {
  return (
    <>
      <p className={styles.caption}>
        Окна и подсказки открываются вживую: нажмите кнопку, Enter или пробел. Esc, клик по
        затемнению или × закрывают окно, и фокус возвращается на кнопку. Подсказку показывает
        наведение курсора или Tab.
      </p>

      <h3 className={styles.heading}>Modal</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Modal
            trigger={<Button variant="outline">Удалить товар</Button>}
            title="Удалить товар из корзины?"
            description="Sandrine, кардиган, 44/46 RUS (M)"
            footer={
              <>
                <ModalClose>
                  <Button variant="outline">Отмена</Button>
                </ModalClose>
                <ModalClose>
                  <Button>Удалить</Button>
                </ModalClose>
              </>
            }
          >
            <p>Товар можно будет снова найти в каталоге.</p>
          </Modal>
          <code className={styles.props}>title, description, footer</code>
        </li>
        <li className={styles.example}>
          <Modal
            trigger={<Button variant="outline">Таблица размеров</Button>}
            title="Таблица размеров"
          >
            {sizeRows.map(([rus, international, chest]) => (
              <p key={rus}>
                {rus} RUS — {international}, обхват груди {chest} см
              </p>
            ))}
          </Modal>
          <code className={styles.props}>длинное содержимое прокручивается</code>
        </li>
      </ul>

      <h3 className={styles.heading}>Drawer</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Drawer
            trigger={<Button variant="outline">Корзина</Button>}
            title="Корзина"
            footer={
              <DrawerClose>
                <Button fullWidth>Перейти к оформлению</Button>
              </DrawerClose>
            }
          >
            <p>Sandrine, кардиган, 44/46 RUS (M)</p>
            <p>Lime, брюки, 42/44 RUS (S)</p>
          </Drawer>
          <code className={styles.props}>432px, footer</code>
        </li>
        <li className={styles.example}>
          <Drawer
            trigger={<Button variant="outline">Пункты выдачи</Button>}
            title="Пункты выдачи"
            wide
          >
            <p>Москва, ул. Тверская, 7 — с 10:00 до 22:00</p>
            <p>Москва, Ленинградский пр-т, 31 — с 9:00 до 21:00</p>
          </Drawer>
          <code className={styles.props}>wide (636px)</code>
        </li>
      </ul>

      <h3 className={styles.heading}>Tooltip</h3>
      <ul className={styles.row}>
        <li className={styles.example}>
          <Tooltip content="В избранное">
            <IconButton aria-label="В избранное">
              <HeartIcon />
            </IconButton>
          </Tooltip>
          <code className={styles.props}>side=&quot;top&quot;</code>
        </li>
        <li className={styles.example}>
          <Tooltip content="Найти похожие" side="bottom">
            <IconButton aria-label="Найти похожие">
              <SearchIcon />
            </IconButton>
          </Tooltip>
          <code className={styles.props}>side=&quot;bottom&quot;</code>
        </li>
        <li className={styles.example}>
          <p className={styles.text}>
            Цена при оплате картой
            <HelpTip aria-label="Как считается цена">
              Цена указана с учётом скидки по карте Lamoda. Без карты товар стоит 7 990 ₽.
            </HelpTip>
          </p>
          <code className={styles.props}>HelpTip: наведение, клик или Enter</code>
        </li>
      </ul>
    </>
  );
}

const sizeRows = [
  ['40/42', 'XXS', '80–84'],
  ['42/44', 'XS', '84–88'],
  ['44/46', 'S', '88–92'],
  ['46/48', 'M', '92–96'],
  ['48/50', 'L', '96–100'],
  ['50/52', 'XL', '100–104'],
  ['52/54', 'XXL', '104–108'],
  ['54/56', '3XL', '108–112'],
  ['56/58', '4XL', '112–116'],
  ['58/60', '5XL', '116–120'],
  ['60/62', '6XL', '120–124'],
  ['62/64', '7XL', '124–128'],
];
