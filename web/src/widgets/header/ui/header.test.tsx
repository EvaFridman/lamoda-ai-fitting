import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './header';

// An async server component, rendered on the server only; the header's own parts are tested here.
vi.mock('./header-categories', () => ({ HeaderCategories: () => null }));

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

  it('draws the gender switch, the city and the icons as inert buttons in the tab order', () => {
    render(<Header />);
    const names = ['Женщинам', 'Укажите ваш населенный пункт', 'Профиль', 'Избранное', 'Корзина'];
    for (const name of names) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
    }
  });

  it('never submits a form: every inert control is type="button"', () => {
    render(<Header />);
    for (const name of [
      'Женщинам',
      'Укажите ваш населенный пункт',
      'Профиль',
      'Избранное',
      'Корзина',
    ]) {
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

    for (const name of [
      'Женщинам',
      'Укажите ваш населенный пункт',
      'Профиль',
      'Избранное',
      'Корзина',
    ]) {
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

  it('has the search field', () => {
    render(<Header />);
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('searchbox', { name: 'Поиск' })).toBeInTheDocument();
  });
});
