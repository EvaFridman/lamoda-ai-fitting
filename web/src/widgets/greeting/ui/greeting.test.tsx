import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getGreeting } from '@/entities/greeting/server';
import { ApiError, reportFailure } from '@/shared/api';

import { Greeting } from './greeting';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/entities/greeting/server', () => ({ getGreeting: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure: vi.fn(),
}));

const getGreetingMock = vi.mocked(getGreeting);
const reportFailureMock = vi.mocked(reportFailure);

describe('Greeting', () => {
  beforeEach(() => {
    getGreetingMock.mockReset();
    reportFailureMock.mockReset();
  });

  it('shows the message from the api', async () => {
    getGreetingMock.mockResolvedValue({ message: 'Hello, world!' });

    render(await Greeting());

    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'network',
      new ApiError('no answer', { kind: 'network', template: '/hello' }),
      'Нет связи с сервером, попробуйте позже',
    ],
    [
      'http 503',
      new ApiError('down', { kind: 'http', template: '/hello', status: 503 }),
      'Сервис временно недоступен, попробуйте позже',
    ],
    [
      'http 404',
      new ApiError('not found', { kind: 'http', template: '/hello', status: 404 }),
      'Что-то пошло не так, попробуйте позже',
    ],
    ['a plain error', new Error('boom'), 'Что-то пошло не так, попробуйте позже'],
  ])('shows the text of %s in an alert and does not throw', async (_name, error, text) => {
    getGreetingMock.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(await Greeting());

    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(reportFailureMock).toHaveBeenCalledWith(error);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
