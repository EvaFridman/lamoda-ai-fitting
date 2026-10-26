import type { ComponentType } from 'react';

import { ButtonsSection } from './buttons-section';
import { CatalogCardSection } from './catalog-card-section';
import { CatalogFiltersSection } from './catalog-filters-section';
import { ChipsSection } from './chips-section';
import { ChoiceSection } from './choice-section';
import { FeedbackSection } from './feedback-section';
import { FieldsSection } from './fields-section';
import { FileInputSection } from './file-input-section';
import { FiltersSection } from './filters-section';
import { GallerySection } from './gallery-section';
import { IconsSection } from './icons-section';
import { LinksSection } from './links-section';
import { MenuSection } from './menu-section';
import { NavigationSection } from './navigation-section';
import { NoticesSection } from './notices-section';
import { OverlaysSection } from './overlays-section';
import { ProductSection } from './product-section';
import { ProgressSection } from './progress-section';
import { ScrollRowSection } from './scroll-row-section';
import { SelectSection } from './select-section';
import { SizesColorsSection } from './sizes-colors-section';
import { SoonSection } from './soon-section';
import { SpinnerSection } from './spinner-section';
import { TokensSection } from './tokens-section';

export interface UiKitSection {
  // The anchor: the section's id and the table of contents' link `#id`.
  id: string;
  title: string;
  Content: ComponentType;
}

// The one list of the page's sections: the table of contents and the sections are both rendered
// from it, so they cannot drift apart (spec 0003, AC1). It lives in ui/, not config/, because it
// holds components.
export const sections: UiKitSection[] = [
  { id: 'tokens', title: 'Токены', Content: TokensSection },
  { id: 'icons', title: 'Иконки', Content: IconsSection },
  { id: 'buttons', title: 'Кнопки', Content: ButtonsSection },
  { id: 'links', title: 'Ссылки', Content: LinksSection },
  { id: 'spinner', title: 'Спиннер', Content: SpinnerSection },
  { id: 'fields', title: 'Поля ввода', Content: FieldsSection },
  { id: 'choice', title: 'Чекбоксы, радиокнопки, переключатели', Content: ChoiceSection },
  { id: 'chips', title: 'Чипы', Content: ChipsSection },
  { id: 'filters', title: 'Фильтры', Content: FiltersSection },
  { id: 'sizes-colors', title: 'Размеры и цвета', Content: SizesColorsSection },
  { id: 'select', title: 'Выпадающий список', Content: SelectSection },
  { id: 'menu', title: 'Меню', Content: MenuSection },
  { id: 'product', title: 'Товар и заказ', Content: ProductSection },
  { id: 'gallery', title: 'Галерея товара', Content: GallerySection },
  { id: 'scroll-row', title: 'Ряд с прокруткой', Content: ScrollRowSection },
  { id: 'catalog-card', title: 'Карточка товара в каталоге', Content: CatalogCardSection },
  { id: 'catalog-filters', title: 'Фильтры каталога', Content: CatalogFiltersSection },
  { id: 'navigation', title: 'Навигация', Content: NavigationSection },
  { id: 'overlays', title: 'Окна и подсказки', Content: OverlaysSection },
  { id: 'feedback', title: 'Уведомления и загрузка', Content: FeedbackSection },
  { id: 'progress', title: 'Прогресс и счётчик', Content: ProgressSection },
  { id: 'soon', title: 'Скоро', Content: SoonSection },
  { id: 'file-input', title: 'Выбор файла', Content: FileInputSection },
  { id: 'notices', title: 'Сообщения и состояния', Content: NoticesSection },
];
