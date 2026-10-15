import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/nextjs';

import { ApiError, errorText } from '@/shared/api';

import { QueryError } from './query-error';

const captureException = vi.mocked(Sentry.captureException);

beforeEach(() => {
  captureException.mockClear();
});

describe('QueryError', () => {
  it('shows the text of an api failure and does not report it again', () => {
    const error = new ApiError('not found', {
      kind: 'http',
      template: '/products/:id',
      method: 'GET',
      status: 404,
      code: 'NOT_FOUND',
    });
    render(<QueryError error={error} />);
    expect(screen.getByRole('alert')).toHaveTextContent(errorText(error));
    expect(screen.getByRole('alert')).toHaveTextContent('Не найдено');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('shows the general text of any other error and reports it', () => {
    const error = new Error('bug in web');
    render(<QueryError error={error} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Что-то пошло не так, попробуйте позже');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[0]).toBe(error);
  });
});
