import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';

import { useSession } from './use-session';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  authFailure: vi.fn(),
  reportApiError: vi.fn(),
}));

vi.mock('@/shared/auth', () => ({
  authClient: { useSession: mocks.useSession },
  authFailure: mocks.authFailure,
}));

vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportApiError: mocks.reportApiError,
}));

function Probe() {
  const session = useSession();
  if (session.status === 'signed-in') return <p>{`in:${session.user.email}`}</p>;
  if (session.status === 'signed-out') return <p>{`signed-out failed:${session.failed}`}</p>;
  return <p>{session.status}</p>;
}

function answer(value: {
  data?: unknown;
  error?: unknown;
  isPending?: boolean;
  isRefetching?: boolean;
}) {
  mocks.useSession.mockReturnValue({ data: null, error: null, isPending: false, ...value });
}

describe('useSession', () => {
  beforeEach(() => {
    mocks.useSession.mockReset();
    mocks.authFailure.mockReset();
    mocks.reportApiError.mockReset();
  });

  it('is pending while the client reads the session', () => {
    answer({ isPending: true });
    render(<Probe />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('is signed out, not failed, when the server answered no session', () => {
    answer({ data: null });
    render(<Probe />);
    expect(screen.getByText('signed-out failed:false')).toBeInTheDocument();
    expect(mocks.reportApiError).not.toHaveBeenCalled();
  });

  it('is signed in with the user of a valid session', () => {
    answer({
      data: {
        user: { id: 'u1', email: 'anna@example.com', name: 'Анна', image: 'x' },
        session: { token: 't' },
      },
    });
    render(<Probe />);
    expect(screen.getByText('in:anna@example.com')).toBeInTheDocument();
    expect(mocks.reportApiError).not.toHaveBeenCalled();
  });

  it('is signed out, failed, and reports a schema failure for a wrong answer', () => {
    answer({ data: { user: { id: 'u1' } } });
    render(<Probe />);
    expect(screen.getByText('signed-out failed:true')).toBeInTheDocument();
    expect(mocks.reportApiError).toHaveBeenCalledTimes(1);
    const reported = mocks.reportApiError.mock.calls[0]?.[0] as ApiError;
    expect(reported).toBeInstanceOf(ApiError);
    expect(reported).toMatchObject({
      kind: 'schema',
      template: '/api/auth/get-session',
      method: 'GET',
    });
  });

  it('is signed out, failed, and reports the failure of a read that errored', () => {
    const error = { status: 503 };
    answer({ data: null, error });
    render(<Probe />);
    expect(screen.getByText('signed-out failed:true')).toBeInTheDocument();
    expect(mocks.authFailure).toHaveBeenCalledExactlyOnceWith(error, 'get-session', 'GET');
  });

  it('stays signed out when a later read marks itself pending with no session', () => {
    answer({ isPending: true });
    const { rerender } = render(<Probe />);
    expect(screen.getByText('pending')).toBeInTheDocument();
    answer({ data: null, isPending: false });
    rerender(<Probe />);
    expect(screen.getByText('signed-out failed:false')).toBeInTheDocument();
    answer({ data: null, isPending: true });
    rerender(<Probe />);
    expect(screen.getByText('signed-out failed:false')).toBeInTheDocument();
    expect(screen.queryByText('pending')).not.toBeInTheDocument();
  });

  it('stays pending while the client has not answered once', () => {
    answer({ isPending: true });
    const { rerender } = render(<Probe />);
    answer({ data: null, isPending: true });
    rerender(<Probe />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('stays failed while a new read is pending, then clears when it answers without an error', () => {
    answer({ data: null, error: { status: 503 } });
    const { rerender } = render(<Probe />);
    expect(screen.getByText('signed-out failed:true')).toBeInTheDocument();
    answer({ data: null, error: null, isPending: true });
    rerender(<Probe />);
    expect(screen.getByText('signed-out failed:true')).toBeInTheDocument();
    answer({ data: null, error: null, isPending: false });
    rerender(<Probe />);
    expect(screen.getByText('signed-out failed:false')).toBeInTheDocument();
  });

  it('stays failed through a pending read after a schema mismatch', () => {
    answer({ data: { user: { id: 'u1' } } });
    const { rerender } = render(<Probe />);
    expect(screen.getByText('signed-out failed:true')).toBeInTheDocument();
    answer({ data: null, error: null, isPending: true });
    rerender(<Probe />);
    expect(screen.getByText('signed-out failed:true')).toBeInTheDocument();
  });

  it('is not failed when a signed-in session is followed by a signed-out answer with no error', () => {
    answer({
      data: {
        user: { id: 'u1', email: 'anna@example.com', name: 'Анна', image: 'x' },
        session: { token: 't' },
      },
    });
    const { rerender } = render(<Probe />);
    expect(screen.getByText('in:anna@example.com')).toBeInTheDocument();
    answer({ data: null, error: null, isPending: false });
    rerender(<Probe />);
    expect(screen.getByText('signed-out failed:false')).toBeInTheDocument();
  });

  describe('while Better Auth reads an existing session again', () => {
    const data = {
      user: { id: 'u1', email: 'anna@example.com', name: 'Анна', image: 'x' },
      session: { token: 't' },
    };

    it.each([
      ['pending', { isPending: true, isRefetching: true }],
      ['not pending', { isPending: false, isRefetching: true }],
    ])('stays signed in with the user when the new read is %s', (_name, flags) => {
      answer({ data });
      const { rerender } = render(<Probe />);
      expect(screen.getByText('in:anna@example.com')).toBeInTheDocument();
      answer({ data, ...flags });
      rerender(<Probe />);
      expect(screen.getByText('in:anna@example.com')).toBeInTheDocument();
      expect(screen.queryByText('pending')).not.toBeInTheDocument();
      expect(mocks.reportApiError).not.toHaveBeenCalled();
    });

    it('stays signed in when the new read fails with a non-401 error and keeps the data', () => {
      const error = { status: 503 };
      answer({ data });
      const { rerender } = render(<Probe />);
      answer({ data, error: null, isPending: false, isRefetching: true });
      rerender(<Probe />);
      answer({ data, error, isPending: false, isRefetching: false });
      rerender(<Probe />);
      expect(screen.getByText('in:anna@example.com')).toBeInTheDocument();
      expect(mocks.authFailure).toHaveBeenCalledExactlyOnceWith(error, 'get-session', 'GET');
    });
  });

  it('reports a failure once while it stays the same', () => {
    const error = { status: 503 };
    answer({ data: null, error });
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    expect(mocks.authFailure).toHaveBeenCalledTimes(1);
  });
});
