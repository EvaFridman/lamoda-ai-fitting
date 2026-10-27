import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userKeys, type User } from '@/entities/user';

import { UploadPhoto } from './upload-photo';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

const fetchMock = vi.fn();

const USER: User = {
  id: '00000000-0000-4000-8000-000000000002',
  phone: null,
  email: 'boris@example.com',
  firstName: null,
  lastName: null,
  patronymic: null,
  dateOfBirth: null,
  gender: null,
  fittingProfileImageKey: null,
  fittingProfileImageUrl: null,
  photoConsentVersion: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

const PHOTO = {
  id: '3f0c1b0e-8d52-4a57-9d6c-0c9f6d1d4a11',
  url: 'https://s3.test/keep/users/u/photo.webp?X-Amz-Signature=abc',
  isDefault: true,
  transient: false,
  width: 768,
  height: 1024,
  createdAt: '2026-10-23T10:00:00.000Z',
};

function tracked(name: string) {
  return mocks.track.mock.calls.filter(([event]) => event === name);
}

function bodies() {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => (init as RequestInit).body as FormData);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UploadPhoto first upload', () => {
  it('gives the consents with a refused first photo, then is never asked again by a remount', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_FAILED',
              message: 'm',
              details: [
                { field: 'photo', code: 'PHOTO_REFUSED', message: 'photo was refused: dark' },
              ],
            },
          }),
          { status: 400 },
        ),
      ),
    );
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(PHOTO), { status: 201 })),
    );
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(userKeys.me, USER);
    const onUploaded = vi.fn();
    const tree = (
      <QueryClientProvider client={queryClient}>
        <UploadPhoto place="photos" onUploaded={onUploaded} />
      </QueryClientProvider>
    );
    const view = render(tree);

    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const tips = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.click(within(tips).getByRole('checkbox', { name: 'На фото — я' }));
    await user.click(within(tips).getByRole('checkbox', { name: /OpenAI/ }));
    await user.upload(
      tips.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!,
      new File(['x'], 'me.jpg', { type: 'image/jpeg' }),
    );

    await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(bodies()[0]?.get('consent')).toBe('1');
    expect(queryClient.getQueryData<User>(userKeys.me)?.photoConsentVersion).toBe(1);
    expect(tracked('Photo Refused')).toEqual([
      ['Photo Refused', { reason: 'dark', source: 'file', place: 'photos', first: true }],
    ]);

    view.unmount();
    render(tree);

    // The pickers are shown at once (no tips); with a mouse there is no camera among them.
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Сделать фото' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
