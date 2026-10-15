import * as Sentry from '@sentry/nextjs';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GlobalError from '../../../app/global-error';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const capture = vi.mocked(Sentry.captureException);

// The component renders <html>, so it needs the document as its container.
function show(error: Error & { digest?: string }) {
  return render(<GlobalError error={error} />, { container: document });
}

describe('GlobalError', () => {
  beforeEach(() => {
    capture.mockReset();
  });

  it('reports an error that has no digest', () => {
    const error = new Error('render failed');
    show(error);
    expect(capture).toHaveBeenCalledWith(error);
    expect(screen.getByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument();
  });

  it('does not report an error with a digest, it was reported on the server', () => {
    show(Object.assign(new Error('redacted'), { digest: '123456' }));
    expect(capture).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument();
  });
});
