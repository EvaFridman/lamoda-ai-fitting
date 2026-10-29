import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserPhoto } from '@/entities/user-photo';

const mocks = vi.hoisted(() => ({ track: vi.fn(), captureException: vi.fn() }));
vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));

import { PhotoPicker, type PhotoPickerProps } from './photo-picker';

const PHOTO = '00000000-0000-4000-8000-0000000000f1';

const saved: UserPhoto = {
  id: PHOTO,
  url: `https://s3.test/keep/users/u/${PHOTO}.webp?X-Amz-Signature=abc`,
  isDefault: true,
  transient: false,
  width: 768,
  height: 1024,
  createdAt: '2026-10-20T12:00:00.000Z',
};

function renderPicker(props: Partial<PhotoPickerProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PhotoPicker
        subject={<p>Сарафан</p>}
        renderStart={() => <button type="button">Примерить</button>}
        photos={[saved]}
        photosFailed={false}
        transient={null}
        onTransient={vi.fn()}
        chosenId={PHOTO}
        onChoose={vi.fn()}
        quota={undefined}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PhotoPicker while a start is on its way (spec 0024 AC19)', () => {
  it('turns «Заменить фото» off', () => {
    renderPicker({ disabled: true });

    expect(screen.getByRole('button', { name: 'Заменить фото' })).toBeDisabled();
  });

  it('keeps «Заменить фото» on otherwise', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: 'Заменить фото' })).toBeEnabled();
  });
});
