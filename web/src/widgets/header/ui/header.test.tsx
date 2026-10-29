import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { use } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './header';

// Async server components, rendered on the server only; the header's own parts are tested here.
// The search stays pending, so its fallback field is what renders.
vi.mock('./header-categories', () => ({ HeaderCategories: () => null }));
// The profile slot stays pending too (it waits for the request): its fallback is the inert icon.
vi.mock('./header-profile-slot', () => {
  const pending = new Promise<never>(() => {});
  return { HeaderProfileSlot: () => use(pending) };
});
vi.mock('./header-room-slot', () => {
  const pending = new Promise<never>(() => {});
  return { HeaderRoomSlot: () => use(pending) };
});
vi.mock('./header-search-slot', () => {
  const pending = new Promise<never>(() => {});
  return { HeaderSearchSlot: () => use(pending), HeaderLoupeSlot: () => use(pending) };
});
vi.mock('./header-city-slot', () => {
  const pending = new Promise<never>(() => {});
  return { HeaderCitySlot: () => use(pending) };
});
vi.mock('./header-menu-slot', () => {
  const pending = new Promise<never>(() => {});
  return { HeaderMenuSlot: () => use(pending) };
});

describe('Header', () => {
  it('still renders its other parts when the categories render nothing', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lamoda, на главную' })).toBeInTheDocument();
  });

  it('has no announcement bar', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).not.toHaveTextContent(/15 лет/);
  });

  it('links the logo to the home page', () => {
    render(<Header />);
    const logo = screen.getByRole('link', { name: 'Lamoda, на главную' });
    expect(logo).toHaveAttribute('href', '/');
    expect(logo.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the gender switch and the icons as inert buttons in the tab order', () => {
    render(<Header />);
    const names = ['Женщинам', 'Профиль', 'Избранное', 'Примерочная', 'Корзина'];
    for (const name of names) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
    }
  });

  it('shows the inert placeholder button while the city slot loads', () => {
    render(<Header />);
    const button = screen.getByRole('button', { name: 'Укажите ваш населенный пункт' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toBeDisabled();
  });

  it('never submits a form: every inert control is type="button"', () => {
    render(<Header />);
    for (const name of ['Женщинам', 'Профиль', 'Избранное', 'Корзина']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('type', 'button');
    }
  });

  it('changes nothing when an inert control is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    document.addEventListener('submit', onSubmit);
    const { container } = render(
      <form>
        <Header />
      </form>,
    );
    const before = container.innerHTML;
    const href = window.location.href;

    for (const name of ['Женщинам', 'Профиль', 'Избранное', 'Корзина']) {
      await user.click(screen.getByRole('button', { name }));
    }

    document.removeEventListener('submit', onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(window.location.href).toBe(href);
    expect(container.innerHTML).toBe(before);
  });

  it('keeps the search field in the header, next to no other textbox', () => {
    render(<Header />);
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('carries no title or data attribute', () => {
    render(<Header />);
    const banner = screen.getByRole('banner');
    for (const element of [banner, ...banner.querySelectorAll('*')]) {
      expect(element).not.toHaveAttribute('title');
      const dataAttributes = element.getAttributeNames().filter((n) => n.startsWith('data-'));
      expect(dataAttributes).toEqual([]);
    }
  });

  it('draws the burger and the loupe once each as inert buttons before the logo', () => {
    render(<Header />);
    // The stylesheet hides both from 600px, which jsdom applies, so roles do not see them.
    const banner = screen.getByRole('banner');
    const burger = [...banner.querySelectorAll<HTMLElement>('button[aria-label="Меню"]')];
    const loupe = [...banner.querySelectorAll<HTMLElement>('button[aria-label="Поиск"]')];
    expect(burger).toHaveLength(1);
    expect(loupe).toHaveLength(1);
    for (const button of [burger[0]!, loupe[0]!]) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('type', 'button');
    }
    const logo = screen.getByRole('link', { name: 'Lamoda, на главную' });
    expect(
      burger[0]!.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(loupe[0]!.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the profile icon mounted next to the burger and the loupe, once', () => {
    render(<Header />);
    expect(screen.getAllByRole('button', { name: 'Профиль' })).toHaveLength(1);
  });

  it('puts the fitting room between favourites and the cart, inert while its slot loads', () => {
    render(<Header />);
    const room = screen.getByRole('button', { name: 'Примерочная' });
    const favourites = screen.getByRole('button', { name: 'Избранное' });
    const cart = screen.getByRole('button', { name: 'Корзина' });
    expect(room).toHaveAttribute('aria-disabled', 'true');
    expect(
      favourites.compareDocumentPosition(room) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(room.compareDocumentPosition(cart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('marks favourites and the cart «скоро» without changing their names', () => {
    render(<Header />);
    for (const name of ['Избранное', 'Корзина']) {
      const button = screen.getByRole('button', { name });
      const chip = within(button).getByText('скоро');
      expect(chip).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getAllByText('скоро')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Профиль' })).not.toHaveTextContent('скоро');
    expect(screen.getByRole('button', { name: 'Примерочная' })).not.toHaveTextContent('скоро');
  });

  it('draws the header icons with no frame', () => {
    render(<Header />);
    for (const name of ['Профиль', 'Избранное', 'Примерочная', 'Корзина']) {
      expect(screen.getByRole('button', { name })).toHaveClass('plain');
    }
  });

  it('has the search field', () => {
    render(<Header />);
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('searchbox', { name: 'Поиск' })).toBeInTheDocument();
  });
});
