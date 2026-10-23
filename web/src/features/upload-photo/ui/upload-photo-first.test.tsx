import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/entities/session';

import { UploadPhoto } from './upload-photo';

// The consent is kept in the module for the tab once given, so the first upload has a file to itself.
const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  session: {
    status: 'signed-in',
    user: { id: 'user-first', email: 'first@example.com', name: 'First' },
  } as SessionState,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  useSession: () => mocks.session,
}));

const KEY = 'fitting-photo-consent:user-first';

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  reset: vi.fn(),
  track: mocks.track,
}));

const fetchMock = vi.fn();

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

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('UploadPhoto first upload', () => {
  it('records the consent when a file is chosen and marks only that upload as the first', async () => {
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
    const queryClient = new QueryClient();
    const onUploaded = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <UploadPhoto place="photos" onUploaded={onUploaded} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Добавить фото' }));
    const tips = await screen.findByRole('dialog', { name: 'Какое фото подойдёт' });
    await user.click(within(tips).getByRole('checkbox', { name: 'На фото — я' }));
    await user.click(within(tips).getByRole('checkbox', { name: /OpenAI/ }));
    expect(window.localStorage.getItem(KEY)).toBeNull();

    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    await user.upload(
      tips.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!,
      file,
    );

    const refused = await screen.findByRole('dialog', { name: 'Фото слишком тёмное' });
    expect(window.localStorage.getItem(KEY)).toBe('1');
    expect(window.localStorage).toHaveLength(1);
    expect(tracked('Photo Refused')).toEqual([
      ['Photo Refused', { reason: 'dark', source: 'file', place: 'photos', first: true }],
    ]);

    await user.upload(
      refused.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!,
      new File(['y'], 'second.jpg', { type: 'image/jpeg' }),
    );

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(tracked('Photo Uploaded')).toEqual([
      ['Photo Uploaded', { saved: true, source: 'file', place: 'photos', first: false }],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Both pickers now sit on the page, the consent screen is not shown again.
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Сделать фото' })).toBeEnabled();
  });
});
