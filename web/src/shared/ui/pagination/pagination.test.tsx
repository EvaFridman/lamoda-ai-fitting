import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from '@/shared/ui';

function Stateful({ start, pageCount }: { start: number; pageCount: number }) {
  const [page, setPage] = useState(start);
  return <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />;
}

function ShowMore({ start, pageCount }: { start: number; pageCount: number }) {
  const [page, setPage] = useState(start);
  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      onPageChange={setPage}
      onShowMore={() => setPage((current) => current + 1)}
    />
  );
}

describe('Pagination', () => {
  it('is a navigation named "Страницы", or by aria-label', () => {
    const first = render(<Pagination page={1} pageCount={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Страницы' })).toBeInTheDocument();
    first.unmount();

    render(
      <Pagination page={1} pageCount={3} onPageChange={vi.fn()} aria-label="Страницы отзывов" />,
    );
    expect(screen.getByRole('navigation', { name: 'Страницы отзывов' })).toBeInTheDocument();
  });

  it('renders no navigation for a single page', () => {
    render(<Pagination page={1} pageCount={1} onPageChange={vi.fn()} />);

    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders links to the pages with getHref, the current one marked', () => {
    render(<Pagination page={2} pageCount={3} getHref={(page) => `/catalog?page=${page}`} />);

    const nav = screen.getByRole('navigation', { name: 'Страницы' });
    expect(within(nav).queryAllByRole('button')).toHaveLength(0);
    expect(within(nav).getByRole('link', { name: 'Страница 1' })).toHaveAttribute(
      'href',
      '/catalog?page=1',
    );
    expect(within(nav).getByRole('link', { name: 'Страница 3' })).toHaveAttribute(
      'href',
      '/catalog?page=3',
    );
    expect(within(nav).getByRole('link', { name: 'Назад' })).toHaveAttribute(
      'href',
      '/catalog?page=1',
    );
    expect(within(nav).getByRole('link', { name: 'Дальше' })).toHaveAttribute(
      'href',
      '/catalog?page=3',
    );
    expect(within(nav).getByRole('link', { name: 'Страница 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Страница 1' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('renders buttons without getHref', () => {
    render(<Pagination page={2} pageCount={3} onPageChange={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: 'Страницы' });
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
    expect(within(nav).getByRole('button', { name: 'Страница 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('hides "Назад" on the first page and "Дальше" on the last', () => {
    const first = render(<Pagination page={1} pageCount={3} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Дальше' })).toBeInTheDocument();
    first.unmount();

    render(<Pagination page={3} pageCount={3} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Дальше' })).toBeNull();
  });

  it('calls onPageChange with the page picked, never with the current one', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={5} pageCount={10} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Страница 5' }));
    expect(onPageChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Страница 10' }));
    expect(onPageChange).toHaveBeenLastCalledWith(10);
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
    expect(onPageChange).toHaveBeenCalledTimes(3);
  });

  it('shows "…" for the hidden pages', () => {
    const middle = render(<Pagination page={5} pageCount={10} onPageChange={vi.fn()} />);
    expect(screen.getAllByText('…')).toHaveLength(2);
    middle.unmount();

    render(<Pagination page={3} pageCount={5} onPageChange={vi.fn()} />);
    expect(screen.queryByText('…')).toBeNull();
  });

  it('keeps the focus on the last page number after "Дальше" leads there', async () => {
    const user = userEvent.setup();
    render(<Stateful start={9} pageCount={10} />);

    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    expect(screen.queryByRole('button', { name: 'Дальше' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Страница 10' })).toHaveFocus();
  });

  it('keeps the focus on the first page number after "Назад" leads there', async () => {
    const user = userEvent.setup();
    render(<Stateful start={2} pageCount={10} />);

    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Страница 1' })).toHaveFocus();
  });

  it('keeps the focus on the last page number after "Показать ещё" leads there', async () => {
    const user = userEvent.setup();
    render(<ShowMore start={2} pageCount={3} />);
    const more = screen.getByRole('button', { name: 'Показать ещё' });

    more.focus();
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Страница 3' })).toHaveFocus();
  });

  it('leaves the focus on "Показать ещё" when showMoreLoading is given', async () => {
    const user = userEvent.setup();
    const onShowMore = vi.fn();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={2}
        pageCount={3}
        onPageChange={onPageChange}
        onShowMore={onShowMore}
        showMoreLoading={false}
      />,
    );
    const more = screen.getByRole('button', { name: 'Показать ещё' });

    more.focus();
    await user.keyboard('{Enter}');

    expect(onShowMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Показать ещё' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Страница 3' })).not.toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onShowMore).toHaveBeenCalledTimes(2);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  describe('counter', () => {
    it('stays alone when there is a single page', () => {
      render(<Pagination page={1} pageCount={1} onPageChange={vi.fn()} shown={5} total={5} />);

      expect(screen.queryByRole('navigation')).toBeNull();
      expect(screen.getByText('5 из 5')).toBeInTheDocument();
    });

    it('shows "10 из 11" when both shown and total are given', () => {
      render(<Pagination page={1} pageCount={2} onPageChange={vi.fn()} shown={10} total={11} />);

      expect(screen.getByText('10 из 11')).toBeInTheDocument();
    });

    it('is not shown with only one of them', () => {
      const onlyShown = render(
        <Pagination page={1} pageCount={2} onPageChange={vi.fn()} shown={10} />,
      );
      expect(onlyShown.container).not.toHaveTextContent('из');
      onlyShown.unmount();

      const onlyTotal = render(
        <Pagination page={1} pageCount={2} onPageChange={vi.fn()} total={11} />,
      );
      expect(onlyTotal.container).not.toHaveTextContent('из');
    });
  });

  describe('"Показать ещё"', () => {
    it('is absent without onShowMore', () => {
      render(<Pagination page={1} pageCount={3} onPageChange={vi.fn()} />);

      expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
    });

    it('calls onShowMore while pages remain', async () => {
      const user = userEvent.setup();
      const onShowMore = vi.fn();
      render(<Pagination page={1} pageCount={3} onPageChange={vi.fn()} onShowMore={onShowMore} />);

      await user.click(screen.getByRole('button', { name: 'Показать ещё' }));

      expect(onShowMore).toHaveBeenCalledTimes(1);
    });

    it('goes away on the last page', () => {
      render(<Pagination page={3} pageCount={3} onPageChange={vi.fn()} onShowMore={vi.fn()} />);

      expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
    });

    it('is busy while loading', () => {
      render(
        <Pagination
          page={1}
          pageCount={3}
          onPageChange={vi.fn()}
          onShowMore={vi.fn()}
          showMoreLoading
        />,
      );

      expect(screen.getByRole('button', { name: 'Показать ещё' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });
  });
});
