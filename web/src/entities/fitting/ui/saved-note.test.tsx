import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FITTINGS_HREF } from '@/shared/config';

import { SavedNote } from './saved-note';

describe('SavedNote', () => {
  it('says where the result is kept, with «Мои примерки» a link to the given address', () => {
    const { container } = render(<SavedNote href={FITTINGS_HREF} />);

    expect(container).toHaveTextContent('Сохранено в «Мои примерки»');
    expect(screen.getByRole('link', { name: '«Мои примерки»' })).toHaveAttribute(
      'href',
      '/customer/fittings',
    );
  });

  it('links to whatever address the page gives', () => {
    render(<SavedNote href="/somewhere" />);

    expect(screen.getByRole('link', { name: '«Мои примерки»' })).toHaveAttribute(
      'href',
      '/somewhere',
    );
  });

  it('passes the tracked element’s click and hover handlers to the link', async () => {
    const events = { onClick: vi.fn(), onPointerEnter: vi.fn(), onPointerLeave: vi.fn() };
    const user = userEvent.setup();
    render(<SavedNote href={FITTINGS_HREF} events={events} />);
    const link = screen.getByRole('link', { name: '«Мои примерки»' });
    link.addEventListener('click', (event) => event.preventDefault());

    await user.hover(link);
    expect(events.onPointerEnter).toHaveBeenCalledOnce();
    await user.click(link);
    expect(events.onClick).toHaveBeenCalledOnce();
    await user.unhover(link);
    expect(events.onPointerLeave).toHaveBeenCalledOnce();
  });

  it('works with no events', async () => {
    const user = userEvent.setup();
    render(<SavedNote href={FITTINGS_HREF} />);
    const link = screen.getByRole('link', { name: '«Мои примерки»' });
    link.addEventListener('click', (event) => event.preventDefault());

    await user.click(link);

    expect(link).toBeInTheDocument();
  });

  it('adds the caller’s class', () => {
    const { container } = render(<SavedNote href={FITTINGS_HREF} className="extra" />);

    expect(container.querySelector('p')).toHaveClass('extra');
  });
});
