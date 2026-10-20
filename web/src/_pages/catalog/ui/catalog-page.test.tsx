import { render, screen } from '@testing-library/react';
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/entities/category/server', () => ({ getCategoryBySlug: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/shared/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/api')>();
  return { ...original, reportFailure: vi.fn() };
});

import { notFound } from 'next/navigation';

import { getCategoryBySlug } from '@/entities/category/server';
import { ApiError, errorText, reportFailure } from '@/shared/api';

import { CatalogPage, CategoryPage } from './catalog-page';

const get = vi.mocked(getCategoryBySlug);

const category = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  name: 'Платья',
  slug: 'dresses',
  isActive: true,
  description: null,
  sortOrder: 1,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

const params = Promise.resolve({ slug: 'dresses' });

// The heading is an async server component, which a jsdom render cannot run: take it out of the
// page's Suspense and await it the way Next does.
async function resolveHeading(): Promise<ReactElement> {
  const main = CategoryPage({ params }) as ReactElement<{ children: ReactElement }>;
  const suspense = main.props.children as ReactElement<{ children: ReactElement }>;
  const heading = suspense.props.children;
  expect(isValidElement(heading)).toBe(true);
  const component = heading.type as (props: unknown) => Promise<ReactElement>;
  return component(heading.props);
}

beforeEach(() => {
  get.mockReset();
  vi.mocked(notFound).mockClear();
  vi.mocked(reportFailure).mockClear();
});

describe('CatalogPage', () => {
  it('shows the catalog heading', () => {
    render(<CatalogPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Каталог' })).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('ignores the params Next passes to /catalog too', () => {
    const props = { params: Promise.resolve({}) };
    render((CatalogPage as (props: unknown) => ReactElement)(props));
    expect(screen.getByRole('heading', { level: 1, name: 'Каталог' })).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe('CategoryPage', () => {
  it('shows the name of an active category', async () => {
    get.mockResolvedValue(category);
    render(await resolveHeading());
    expect(get).toHaveBeenCalledWith('dresses');
    expect(screen.getByRole('heading', { level: 1, name: 'Платья' })).toBeInTheDocument();
  });

  it('calls notFound for a missing category', async () => {
    get.mockResolvedValue(null);
    await expect(resolveHeading()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound for an inactive category', async () => {
    get.mockResolvedValue({ ...category, isActive: false });
    await expect(resolveHeading()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('shows the error text and reports the failure when the read fails', async () => {
    const error = new ApiError('m', { kind: 'http', template: '/t', status: 500 });
    get.mockRejectedValue(error);
    render(await resolveHeading());
    expect(screen.getByRole('alert')).toHaveTextContent(errorText(error));
    expect(reportFailure).toHaveBeenCalledWith(error);
    expect(notFound).not.toHaveBeenCalled();
  });
});
