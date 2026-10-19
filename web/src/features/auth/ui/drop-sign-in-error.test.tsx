import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DropSignInError } from './drop-sign-in-error';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  navigation: { pathname: '/catalog', params: new URLSearchParams() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.navigation.pathname,
  useSearchParams: () => mocks.navigation.params,
  useRouter: () => ({ replace: mocks.replace }),
}));

describe('DropSignInError', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.navigation.pathname = '/catalog';
    mocks.navigation.params = new URLSearchParams();
  });

  it('renders nothing', () => {
    mocks.navigation.params = new URLSearchParams('error=access_denied');
    const { container } = render(<DropSignInError />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not touch the address without an error param', () => {
    mocks.navigation.params = new URLSearchParams('a=1');
    render(<DropSignInError />);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('replaces the address with the path alone when nothing else remains', () => {
    mocks.navigation.params = new URLSearchParams('error=access_denied&error_description=no');
    render(<DropSignInError />);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/catalog', { scroll: false });
  });

  it('keeps the rest of the query', () => {
    mocks.navigation.params = new URLSearchParams('a=1&error=server_error&error_description=x&b=2');
    render(<DropSignInError />);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/catalog?a=1&b=2', { scroll: false });
  });
});
