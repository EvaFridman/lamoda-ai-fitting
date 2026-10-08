import type { ComponentType } from 'react';

import { IconsSection } from './icons-section';
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
];
