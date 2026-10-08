import type { ComponentType } from 'react';

import { ButtonsSection } from './buttons-section';
import { ChoiceSection } from './choice-section';
import { FieldsSection } from './fields-section';
import { FiltersSection } from './filters-section';
import { IconsSection } from './icons-section';
import { LinksSection } from './links-section';
import { NavigationSection } from './navigation-section';
import { ProductSection } from './product-section';
import { SelectSection } from './select-section';
import { SizesColorsSection } from './sizes-colors-section';
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
  { id: 'filters', title: 'Фильтры', Content: FiltersSection },
  { id: 'sizes-colors', title: 'Размеры и цвета', Content: SizesColorsSection },
  { id: 'select', title: 'Выпадающий список', Content: SelectSection },
  { id: 'product', title: 'Товар и заказ', Content: ProductSection },
  { id: 'navigation', title: 'Навигация', Content: NavigationSection },
];
