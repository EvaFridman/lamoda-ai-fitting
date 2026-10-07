import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { colorGroups, fontWeights, shadows, spacing, typeScale } from '../config/tokens';

import { TokensSection } from './tokens-section';

function itemOf(token: string): HTMLElement {
  const item = screen.getByText(token).closest('li');
  if (!item) throw new Error(`no list item for ${token}`);
  return item;
}

describe('TokensSection', () => {
  it('shows every colour with its name, value and token', () => {
    render(<TokensSection />);

    for (const group of colorGroups) {
      expect(screen.getByRole('heading', { name: group.title })).toBeInTheDocument();
      for (const { token, name, value } of group.tokens) {
        const item = itemOf(token);
        expect(within(item).getByText(name)).toBeInTheDocument();
        expect(within(item).getByText(value)).toBeInTheDocument();
      }
    }
  });

  it('shows every type style with its size and line height', () => {
    render(<TokensSection />);

    for (const { name, size, lineHeight } of typeScale) {
      expect(screen.getByText(`${name} · ${size}/${lineHeight}`)).toBeInTheDocument();
    }
  });

  it('shows every font weight with its name, value and token', () => {
    render(<TokensSection />);

    for (const { token, name, value } of fontWeights) {
      const item = screen.getByText(`${value} · ${token}`).closest('li');
      expect(item).not.toBeNull();
      expect(within(item as HTMLElement).getByText(name)).toBeInTheDocument();
    }
  });

  it('shows every spacing step in px with its token', () => {
    render(<TokensSection />);

    for (const { token, value } of spacing) {
      expect(screen.getByText(`${value}px · ${token}`)).toBeInTheDocument();
    }
  });

  it('shows every shadow with its name, value and token', () => {
    render(<TokensSection />);

    for (const { token, name, value } of shadows) {
      const item = itemOf(token);
      expect(within(item).getByText(name)).toBeInTheDocument();
      expect(within(item).getByText(value)).toBeInTheDocument();
    }
  });
});
