import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGreeting } from '@/entities/greeting/server';
import { ApiError } from '@/shared/api';

import { Greeting } from './greeting';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/entities/greeting/server', () => ({ getGreeting: vi.fn() }));

const getGreetingMock = vi.mocked(getGreeting);

const ERROR_TEXT = 'Не удалось получить приветствие от сервера. Попробуйте обновить страницу.';

describe('Greeting', () => {
  beforeEach(() => {
    getGreetingMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the message from the api', async () => {
    getGreetingMock.mockResolvedValue({ message: 'Hello, world!' });

    render(await Greeting());

    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['network', new ApiError('no answer', { kind: 'network', template: '/hello' })],
    ['http 404', new ApiError('not found', { kind: 'http', template: '/hello', status: 404 })],
    ['http 503', new ApiError('down', { kind: 'http', template: '/hello', status: 503 })],
    ['a plain error', new Error('boom')],
  ])('shows an alert and does not throw on %s', async (_name, error) => {
    getGreetingMock.mockRejectedValue(error);

    render(await Greeting());

    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_TEXT);
  });
});
