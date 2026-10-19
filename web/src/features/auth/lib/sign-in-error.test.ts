import { describe, expect, it } from 'vitest';

import { signInErrorCode, signInRedirectError, withoutSignInError } from './sign-in-error';

describe('signInErrorCode', () => {
  it('is null without an error param', () => {
    expect(signInErrorCode(new URLSearchParams('a=1'))).toBeNull();
  });

  it.each(['access_denied', 'unable_to_create_user', 'A1_b', 'x'.repeat(64)])(
    'gives the code %s as it is',
    (code) => {
      expect(signInErrorCode(new URLSearchParams({ error: code }))).toBe(code);
    },
  );

  it.each(['', 'a b', 'a-b', '<script>', 'кириллица', 'x'.repeat(65), 'a\nb'])(
    'gives "unknown" for the value %j that is not a code',
    (value) => {
      expect(signInErrorCode(new URLSearchParams({ error: value }))).toBe('unknown');
    },
  );
});

describe('withoutSignInError', () => {
  it('drops error and error_description and keeps the other params', () => {
    const rest = withoutSignInError(
      new URLSearchParams('a=1&error=access_denied&b=2&error_description=nope&a=3'),
    );
    expect(rest.toString()).toBe('a=1&b=2&a=3');
  });

  it('is empty when only the error params were there', () => {
    expect(withoutSignInError(new URLSearchParams('error=x')).toString()).toBe('');
  });

  it('does not change the params it was given', () => {
    const params = new URLSearchParams('error=x&a=1');
    withoutSignInError(params);
    expect(params.toString()).toBe('error=x&a=1');
  });
});

describe('signInRedirectError', () => {
  it('is an Error named SignInFailed with the code in the message', () => {
    const error = signInRedirectError('server_error');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SignInFailed');
    expect(error.message).toBe('sign-in came back with server_error');
  });
});
