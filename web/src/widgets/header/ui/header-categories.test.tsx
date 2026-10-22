import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Category } from '@/entities/category';
import { getActiveCategories } from '@/entities/category/server';
import { ApiError, reportFailure } from '@/shared/api';

import { HeaderCategories } from './header-categories';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/entities/category/server', () => ({ getActiveCategories: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure: vi.fn(),
}));

const getCategoriesMock = vi.mocked(getActiveCategories);
const reportFailureMock = vi.mocked(reportFailure);

function category(id: string, name: string, sortOrder: number): Category {
  return {
    id,
    name,
    slug: `slug-${id}`,
    isActive: true,
    description: null,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('HeaderCategories', () => {
  beforeEach(() => {
    getCategoriesMock.mockReset();
    reportFailureMock.mockReset();
  });

  it('asks the api for the active categories, 100 at most', async () => {
    getCategoriesMock.mockResolvedValue({ items: [], total: 0 });

    await HeaderCategories();

    expect(getCategoriesMock).toHaveBeenCalledTimes(1);
    expect(getCategoriesMock).toHaveBeenCalledWith();
  });

  it('lists the names in the order the api returned them, and nothing else', async () => {
    getCategoriesMock.mockResolvedValue({
      items: [
        category('1', 'Обувь', 1),
        category('2', 'Одежда', 2),
        category('3', 'Аксессуары', 3),
      ],
      total: 3,
    });

    render(await HeaderCategories());

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Обувь', 'Одежда', 'Аксессуары']);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it('renders each category as a link to its catalog page, in the api order', async () => {
    getCategoriesMock.mockResolvedValue({
      items: [category('1', 'Обувь', 1), category('2', 'Одежда', 2)],
      total: 2,
    });

    render(await HeaderCategories());

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Обувь', 'Одежда']);
    expect(screen.getByRole('link', { name: 'Обувь' })).toHaveAttribute('href', '/catalog/slug-1');
    expect(screen.getByRole('link', { name: 'Одежда' })).toHaveAttribute('href', '/catalog/slug-2');
  });

  it('encodes a slug into one path segment', async () => {
    getCategoriesMock.mockResolvedValue({
      items: [{ ...category('1', 'Особая', 1), slug: 'a/b?c d#é' }],
      total: 1,
    });

    render(await HeaderCategories());

    expect(screen.getByRole('link', { name: 'Особая' })).toHaveAttribute(
      'href',
      '/catalog/a%2Fb%3Fc%20d%23%C3%A9',
    );
  });

  it.each([
    ['an ApiError', new ApiError('down', { kind: 'http', template: '/categories', status: 503 })],
    ['a plain error', new Error('boom')],
  ])('renders nothing and reports the failure on %s', async (_name, error) => {
    getCategoriesMock.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await HeaderCategories();
    const { container } = render(result);

    expect(container).toBeEmptyDOMElement();
    expect(reportFailureMock).toHaveBeenCalledTimes(1);
    expect(reportFailureMock).toHaveBeenCalledWith(error);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders nothing, not an empty list, when there are no categories', async () => {
    getCategoriesMock.mockResolvedValue({ items: [], total: 0 });

    const { container } = render(await HeaderCategories());

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(reportFailureMock).not.toHaveBeenCalled();
  });
});
