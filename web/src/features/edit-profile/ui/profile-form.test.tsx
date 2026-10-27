import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Activity } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type User, userKeys } from '@/entities/user';

import { ProfileForm } from './profile-form';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  showToast: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/shared/analytics/client', () => ({
  identify: vi.fn(),
  track: mocks.track,
  reset: vi.fn(),
}));

vi.mock('@/entities/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/session')>()),
  refreshSession: mocks.refreshSession,
}));

vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  showToast: mocks.showToast,
}));

const DATE = '2026-10-01T12:00:00.000Z';
const user: User = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  phone: null,
  email: 'anna.private@example.com',
  firstName: 'Ева',
  lastName: 'Иванова',
  patronymic: null,
  dateOfBirth: '1990-05-12',
  gender: 'female',
  fittingProfileImageKey: null,
  fittingProfileImageUrl: null,
  photoConsentVersion: null,
  createdAt: DATE,
  updatedAt: DATE,
};

const fetchMock = vi.fn();
let queryClient: QueryClient;

function renderForm(saved: User = user) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileForm user={saved} />
    </QueryClientProvider>,
  );
}

function answer(body: unknown, status = 200) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

function failure(code: string, status: number, details: unknown[] = []) {
  answer({ error: { code, message: 'm', details } }, status);
}

function sentBody(): unknown {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
  expect(new URL(String(url)).pathname).toBe('/api/me');
  expect(init.method).toBe('PATCH');
  return JSON.parse(String(init.body));
}

const save = () => screen.getByRole('button', { name: 'Сохранить' });
const field = (name: string) => screen.getByRole('textbox', { name });

async function replace(name: string, text: string) {
  const input = field(name);
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  mocks.track.mockReset();
  mocks.showToast.mockReset();
  mocks.refreshSession.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfileForm fields', () => {
  it('is filled from the user', () => {
    renderForm();
    expect(field('Фамилия')).toHaveValue('Иванова');
    expect(field('Имя')).toHaveValue('Ева');
    expect(field('Отчество')).toHaveValue('');
    expect(field('Дата рождения')).toHaveValue('12.05.1990');
    expect(screen.getByRole('radio', { name: 'Женский' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Мужской' })).not.toBeChecked();
  });

  it('checks no gender for a user without one', () => {
    renderForm({ ...user, gender: null });
    expect(screen.getByRole('radio', { name: 'Женский' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Мужской' })).not.toBeChecked();
  });

  it('shows the email as text, not as a field, and has no phone or password field', () => {
    renderForm();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /e-?mail|почт/i })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(user.email)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/телефон|пароль/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it('masks the date as it is typed', async () => {
    renderForm();
    await replace('Дата рождения', '13061991');
    expect(field('Дата рождения')).toHaveValue('13.06.1991');
  });
});

describe('ProfileForm "Сохранить"', () => {
  it('is disabled until something changes, and again when the value is changed back', async () => {
    renderForm();
    expect(save()).toBeDisabled();
    await userEvent.type(field('Имя'), 'а');
    expect(save()).toBeEnabled();
    await userEvent.type(field('Имя'), '{Backspace}');
    expect(save()).toBeDisabled();
  });

  it('is enabled by a date typed partway, so the save can say what is wrong', async () => {
    renderForm();
    await replace('Дата рождения', '1205');
    expect(save()).toBeEnabled();
  });
});

describe('ProfileForm request', () => {
  it('sends only the changed fields', async () => {
    answer({ ...user, firstName: 'Анна' });
    renderForm();
    await replace('Имя', '  Анна ');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(sentBody()).toEqual({ firstName: 'Анна' });
  });

  it('sends the date as YYYY-MM-DD and a chosen gender', async () => {
    answer(user);
    renderForm();
    await replace('Дата рождения', '13061991');
    await userEvent.click(screen.getByRole('radio', { name: 'Мужской' }));
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(sentBody()).toEqual({ dateOfBirth: '1991-06-13', gender: 'male' });
  });

  it('sends null for cleared names and a cleared date', async () => {
    answer({ ...user, lastName: null, dateOfBirth: null });
    renderForm();
    await replace('Фамилия', '');
    await replace('Дата рождения', '');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(sentBody()).toEqual({ lastName: null, dateOfBirth: null });
  });

  it('cannot go back to no gender: choosing again keeps it, and the body never carries null', async () => {
    answer({ ...user, gender: 'male' });
    renderForm({ ...user, gender: null });
    const male = screen.getByRole('radio', { name: 'Мужской' });
    await userEvent.click(male);
    expect(male).toBeChecked();
    await userEvent.click(male);
    expect(male).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Женский' })).not.toBeChecked();
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(sentBody()).toEqual({ gender: 'male' });
  });

  it('sends no second request for Enter while saving', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderForm();
    await userEvent.type(field('Имя'), 'а');
    await userEvent.type(field('Имя'), '{Enter}');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.type(field('Фамилия'), '{Enter}{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileForm date check', () => {
  it('asks for the whole date, without a request', async () => {
    renderForm();
    await replace('Дата рождения', '1205');
    await userEvent.click(save());
    expect(screen.getByText('Введите дату полностью')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says a date that does not exist, without a request', async () => {
    renderForm();
    await replace('Дата рождения', '31022001');
    await userEvent.click(save());
    expect(screen.getByText('Такой даты нет')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the error when the field is edited', async () => {
    renderForm();
    await replace('Дата рождения', '1205');
    await userEvent.click(save());
    expect(screen.getByText('Введите дату полностью')).toBeInTheDocument();
    await userEvent.type(field('Дата рождения'), '1');
    expect(screen.queryByText('Введите дату полностью')).not.toBeInTheDocument();
  });
});

describe('ProfileForm refusals', () => {
  const details = [
    { field: 'firstName', code: 'IS_PERSON_NAME', message: 'm' },
    { field: 'dateOfBirth', code: 'IS_DATE_OF_BIRTH', message: 'm' },
  ];

  it('shows a 400 under the fields it names, with no toast', async () => {
    failure('VALIDATION_FAILED', 400, details);
    renderForm();
    await replace('Имя', 'Э');
    await replace('Дата рождения', '01012020');
    await userEvent.click(save());
    expect(
      await screen.findByText('От 2 до 50 букв, между ними можно пробел, дефис или апостроф'),
    ).toBeInTheDocument();
    expect(screen.getByText('Дата с 01.01.1900, возраст не меньше 14 лет')).toBeInTheDocument();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(field('Имя')).toHaveValue('Э');
  });

  it('clears the error of a field when it is edited, and only that one', async () => {
    failure('VALIDATION_FAILED', 400, details);
    renderForm();
    await replace('Имя', 'Э');
    await replace('Дата рождения', '01012020');
    await userEvent.click(save());
    await screen.findByText('Дата с 01.01.1900, возраст не меньше 14 лет');
    await userEvent.type(field('Имя'), 'в');
    expect(
      screen.queryByText('От 2 до 50 букв, между ними можно пробел, дефис или апостроф'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Дата с 01.01.1900, возраст не меньше 14 лет')).toBeInTheDocument();
  });

  it('shows a 503 in a toast and keeps what was typed', async () => {
    failure('SERVICE_UNAVAILABLE', 503);
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
        title: 'Сервис временно недоступен, попробуйте позже',
        tone: 'error',
      }),
    );
    expect(field('Имя')).toHaveValue('Анна');
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('shows a network error in a toast and keeps what was typed', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
        title: 'Нет связи с сервером, попробуйте позже',
        tone: 'error',
      }),
    );
    expect(field('Имя')).toHaveValue('Анна');
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('shows a 400 that names no field of the form in a toast', async () => {
    failure('VALIDATION_FAILED', 400, [{ field: 'phone', code: 'IS_STRING', message: 'm' }]);
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({
        title: 'Некоторые данные указаны неверно',
        tone: 'error',
      }),
    );
  });
});

describe('ProfileForm success', () => {
  const saved: User = { ...user, firstName: 'Анна', updatedAt: '2026-10-02T12:00:00.000Z' };

  it('puts the answer in the cache, shows a toast and counts the save', async () => {
    answer(saved);
    queryClient.setQueryData(userKeys.me, user);
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Данные сохранены' }),
    );
    expect(queryClient.getQueryData(userKeys.me)).toEqual(saved);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Account Data Saved', {});
  });

  it('refreshes the session when the first name was sent', async () => {
    answer(saved);
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledTimes(1));
  });

  it('does not refresh the session when another field was sent', async () => {
    answer({ ...user, lastName: 'Петрова' });
    renderForm();
    await replace('Фамилия', 'Петрова');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes the session when the first name was cleared', async () => {
    answer({ ...user, firstName: null });
    renderForm();
    await replace('Имя', '');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({ firstName: null });
  });

  it('is not broken by a refresh that fails', async () => {
    answer(saved);
    mocks.refreshSession.mockRejectedValue(new Error('boom'));
    queryClient.setQueryData(userKeys.me, user);
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledTimes(1));
    expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Данные сохранены' });
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Account Data Saved', {});
    expect(queryClient.getQueryData(userKeys.me)).toEqual(saved);
  });

  it('does not write the cache when it is empty at the time the answer arrives, but still toasts and counts', async () => {
    answer(saved);
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Данные сохранены' }),
    );
    expect(queryClient.getQueryData(userKeys.me)).toBeUndefined();
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Account Data Saved', {});
  });

  it('does not overwrite the cache holding another user, but still toasts and counts', async () => {
    const other: User = { ...user, id: '9a8b7c6d-1111-4222-8333-444455556666', firstName: 'Олег' };
    answer(saved);
    queryClient.setQueryData(userKeys.me, other);
    renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith({ title: 'Данные сохранены' }),
    );
    expect(queryClient.getQueryData(userKeys.me)).toEqual(other);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith('Account Data Saved', {});
  });
});

describe('ProfileForm in a hidden <Activity>', () => {
  function renderInActivity(mode: 'visible' | 'hidden') {
    const tree = (current: 'visible' | 'hidden') => (
      <QueryClientProvider client={queryClient}>
        <Activity mode={current}>
          <ProfileForm user={user} />
        </Activity>
      </QueryClientProvider>
    );
    const view = render(tree(mode));
    return (next: 'visible' | 'hidden') => view.rerender(tree(next));
  }

  it('keeps the typed text, and the save button matching it, after hide and show', async () => {
    const setMode = renderInActivity('visible');
    await userEvent.type(field('Имя'), 'а');
    expect(field('Имя')).toHaveValue('Еваа');
    expect(save()).toBeEnabled();
    setMode('hidden');
    setMode('visible');
    expect(field('Имя')).toHaveValue('Еваа');
    expect(field('Фамилия')).toHaveValue('Иванова');
    expect(save()).toBeEnabled();
  });

  it('keeps the save disabled after hide and show when nothing was typed', () => {
    const setMode = renderInActivity('visible');
    setMode('hidden');
    setMode('visible');
    expect(field('Имя')).toHaveValue('Ева');
    expect(save()).toBeDisabled();
  });

  it('keeps the saved text, not the starting one, after a save and hide and show', async () => {
    answer({ ...user, firstName: 'Анна' });
    queryClient.setQueryData(userKeys.me, user);
    const setMode = renderInActivity('visible');
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    setMode('hidden');
    setMode('visible');
    expect(field('Имя')).toHaveValue('Анна');
  });
});

describe('ProfileForm recordings', () => {
  it('is a block the recordings skip', () => {
    const { container } = renderForm();
    expect(container.querySelector('form')).toHaveClass('mp-block');
  });

  it('puts no typed value, name, date or email in any attribute, value included', async () => {
    const { container } = renderForm();
    const secrets = ['Секретнова', 'Ева', 'Иванова', '13.06.1991', '12.05.1990', 'anna.private'];
    const leaks = () =>
      Array.from(container.querySelectorAll('*')).flatMap((element) =>
        Array.from(element.attributes)
          .filter((attribute) => secrets.some((secret) => attribute.value.includes(secret)))
          .map((attribute) => `${element.tagName} ${attribute.name}=${attribute.value}`),
      );
    expect(leaks()).toEqual([]);
    await replace('Фамилия', 'Секретнова');
    await replace('Дата рождения', '13061991');
    expect(leaks()).toEqual([]);
    expect(field('Фамилия')).toHaveValue('Секретнова');
  });

  it('writes the starting text only into the DOM value: the inputs carry just their names', () => {
    const { container } = renderForm();
    for (const text of [
      field('Фамилия'),
      field('Имя'),
      field('Отчество'),
      field('Дата рождения'),
    ]) {
      expect(text).not.toHaveAttribute('value');
    }
    const names = Array.from(container.querySelectorAll('input[type="text"], input:not([type])'))
      .map((input) => input.getAttribute('name'))
      .sort();
    expect(names).toEqual(['dateOfBirth', 'firstName', 'lastName', 'patronymic']);
  });

  it('raises the floating label of a pre-filled field only', () => {
    renderForm();
    expect(field('Фамилия').closest('[data-filled]')).not.toBeNull();
    expect(field('Дата рождения').closest('[data-filled]')).not.toBeNull();
    expect(field('Отчество').closest('[data-filled]')).toBeNull();
  });
});

describe('ProfileForm saving once', () => {
  function pending() {
    let settle: (response: Response) => void = () => undefined;
    let fail: (reason: unknown) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve, reject) => {
          settle = resolve;
          fail = reject;
        }),
    );
    return {
      resolve: (body: unknown) => settle(new Response(JSON.stringify(body), { status: 200 })),
      reject: (reason: unknown) => fail(reason),
    };
  }

  it('sends one PATCH for two submits in the same tick', async () => {
    pending();
    const { container } = renderForm();
    await userEvent.type(field('Имя'), 'а');
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      fireEvent.submit(form);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends one PATCH for two clicks of "Сохранить" in the same tick', async () => {
    pending();
    renderForm();
    await userEvent.type(field('Имя'), 'а');
    act(() => {
      fireEvent.click(save());
      fireEvent.click(save());
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('allows a new save after a failure', async () => {
    const request = pending();
    renderForm();
    await userEvent.type(field('Имя'), 'а');
    await userEvent.click(save());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    request.reject(new TypeError('Failed to fetch'));
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('allows a new save after a success', async () => {
    const request = pending();
    renderForm();
    await userEvent.type(field('Имя'), 'а');
    await userEvent.click(save());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    request.resolve({ ...user, firstName: 'Ева' + 'а' });
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledTimes(1));
    await userEvent.type(field('Фамилия'), 'я');
    await vi.waitFor(() => expect(save()).toBeEnabled());
    await userEvent.click(save());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('keeps no mutation in the cache once the form is gone', async () => {
    answer({ ...user, firstName: 'Анна' });
    const { unmount } = renderForm();
    await replace('Имя', 'Анна');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    unmount();
    await vi.waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]));
  });
});

describe('ProfileForm trimmed names', () => {
  it('shows a name typed with spaces trimmed once saved', async () => {
    answer({ ...user, firstName: 'Анна' });
    renderForm();
    await replace('Имя', '  Анна ');
    expect(field('Имя')).toHaveValue('  Анна ');
    await userEvent.click(save());
    await vi.waitFor(() => expect(field('Имя')).toHaveValue('Анна'));
  });

  it('keeps the newer text when the field was edited while saving', async () => {
    let settle: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );
    renderForm();
    await replace('Имя', '  Анна ');
    await userEvent.click(save());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.type(field('Имя'), 'м');
    settle(new Response(JSON.stringify({ ...user, firstName: 'Анна' }), { status: 200 }));
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(field('Имя')).toHaveValue('  Анна м');
    expect(save()).toBeEnabled();
  });
});

describe('ProfileForm names and the date', () => {
  it('accepts a name of 50 letters: the client has no length rule', async () => {
    const long = 'а'.repeat(50);
    answer({ ...user, firstName: long });
    renderForm();
    await replace('Имя', long);
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(sentBody()).toEqual({ firstName: long });
  });

  it('stores nulls for a cleared form', async () => {
    const full: User = { ...user, patronymic: 'Петровна' };
    answer({ ...full, lastName: null, firstName: null, patronymic: null, dateOfBirth: null });
    renderForm(full);
    await replace('Фамилия', '');
    await replace('Имя', '');
    await replace('Отчество', '');
    await replace('Дата рождения', '');
    await userEvent.click(save());
    await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(sentBody()).toEqual({
      lastName: null,
      firstName: null,
      patronymic: null,
      dateOfBirth: null,
    });
  });

  it('keeps the caret after the digits before it when a digit in the middle is deleted', async () => {
    renderForm();
    const input = field('Дата рождения') as HTMLInputElement;
    input.focus();
    input.setSelectionRange(4, 4);
    await userEvent.keyboard('{Backspace}');
    expect(input).toHaveValue('12.51.990');
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it('turns a pasted ISO date around', async () => {
    renderForm();
    await userEvent.clear(field('Дата рождения'));
    await userEvent.click(field('Дата рождения'));
    await userEvent.paste(' 2001-03-04 ');
    expect(field('Дата рождения')).toHaveValue('04.03.2001');
  });
});
