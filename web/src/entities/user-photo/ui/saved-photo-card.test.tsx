import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SavedPhotoCard, uploadedOn, type SavedPhotoCardProps } from './saved-photo-card';

const THIS_YEAR = new Date().getFullYear();
// Noon of a day in the current year, local time: the date reads the same in any time zone.
const THIS_YEAR_ISO = new Date(THIS_YEAR, 5, 15, 12).toISOString();

function photo(isDefault: boolean, createdAt = THIS_YEAR_ISO) {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    url: 'https://s3.test/keep/users/u/p2.webp?X-Amz-Signature=sig2',
    isDefault,
    width: 768,
    height: 1024,
    createdAt,
  };
}

function renderCard(props: Partial<SavedPhotoCardProps> & Pick<SavedPhotoCardProps, 'layout'>) {
  const onMakeDefault = vi.fn();
  const onDelete = vi.fn();
  render(
    <SavedPhotoCard
      photo={photo(false)}
      position={2}
      onMakeDefault={onMakeDefault}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onMakeDefault, onDelete };
}

const makeDefaultRadio = () => screen.getByRole('radio', { name: 'Сделать основным фото 2' });

describe('uploadedOn', () => {
  const now = new Date(2026, 9, 23, 12);

  it('is the day and month in Russian for this year', () => {
    expect(uploadedOn(new Date(2026, 9, 12, 12).toISOString(), now)).toBe('12 октября');
  });

  it('reads the day in Moscow time, not the local one', () => {
    expect(uploadedOn('2026-03-31T21:30:00Z', new Date('2026-06-01T12:00:00Z'))).toBe('1 апреля');
  });

  it('compares the years in Moscow time', () => {
    // 2025-12-31 22:00 UTC is already 2026-01-01 in Moscow: the same year as now.
    expect(uploadedOn('2025-12-31T22:00:00Z', new Date('2026-01-01T09:00:00Z'))).toBe('1 января');
    // 2025-12-31 20:00 UTC is still 2025 in Moscow: another year than now.
    expect(uploadedOn('2025-12-31T20:00:00Z', new Date('2026-01-01T09:00:00Z'))).toMatch(
      /^31 декабря 2025( г\.)?$/,
    );
  });

  it('adds the year for another year', () => {
    expect(uploadedOn(new Date(2025, 9, 12, 12).toISOString(), now)).toMatch(
      /^12 октября 2025( г\.)?$/,
    );
  });
});

describe('SavedPhotoCard as a card', () => {
  it('shows the default photo with its badge and the upload date, and no radio', () => {
    renderCard({ layout: 'card', photo: photo(true) });

    expect(screen.getByRole('img', { name: 'Фото 2' })).toBeInTheDocument();
    expect(screen.getByRole('figure')).toHaveTextContent('По умолчанию');
    expect(screen.getByText('Загружено 15 июня')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('adds the year to the date of a photo from another year', () => {
    renderCard({ layout: 'card', photo: photo(true, '2020-06-15T12:00:00.000Z') });

    expect(screen.getByText(/^Загружено 15 июня 2020/)).toBeInTheDocument();
  });

  it('shows another photo with the radio «Сделать основным», in a named group, never checked', () => {
    renderCard({ layout: 'card' });

    expect(screen.getByRole('radiogroup', { name: 'Фото 2' })).toBeInTheDocument();
    expect(makeDefaultRadio()).not.toBeChecked();
    expect(makeDefaultRadio()).toBeEnabled();
    // The visible label stays «Сделать основным»; «фото 2», its last words, are in the name only.
    const label = makeDefaultRadio().closest('label')!.cloneNode(true) as HTMLElement;
    label.querySelector('.hidden')?.remove();
    expect(label.textContent?.replace(/\s+/g, ' ').trim()).toBe('Сделать основным');
    expect(screen.getByRole('figure')).not.toHaveTextContent('По умолчанию');
    expect(screen.queryByText(/Загружено/)).not.toBeInTheDocument();
  });

  it('choosing the radio calls onMakeDefault and the tracked element once', async () => {
    const user = userEvent.setup();
    const events = { onClick: vi.fn(), onPointerEnter: vi.fn(), onPointerLeave: vi.fn() };
    const { onMakeDefault, onDelete } = renderCard({ layout: 'card', makeDefaultEvents: events });

    await user.hover(makeDefaultRadio());
    expect(events.onPointerEnter).toHaveBeenCalledTimes(1);
    await user.click(makeDefaultRadio());

    expect(onMakeDefault).toHaveBeenCalledTimes(1);
    expect(events.onClick).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('is off while busy', async () => {
    const user = userEvent.setup();
    const { onMakeDefault } = renderCard({ layout: 'card', busy: true });

    expect(makeDefaultRadio()).toHaveAttribute('aria-disabled', 'true');
    await user.click(makeDefaultRadio());

    expect(onMakeDefault).not.toHaveBeenCalled();
  });

  it('the bin «Удалить фото 2» calls onDelete, for the default photo too', async () => {
    const user = userEvent.setup();
    const { onDelete, onMakeDefault } = renderCard({ layout: 'card', photo: photo(true) });

    await user.click(screen.getByRole('button', { name: 'Удалить фото 2' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onMakeDefault).not.toHaveBeenCalled();
  });

  it('keeps the photo link only as the image src, inside a recorder-blocked figure', () => {
    renderCard({ layout: 'card' });

    const figure = screen.getByRole('figure');
    expect(figure).toHaveClass('mp-block');
    expect(screen.getByRole('img', { name: 'Фото 2' })).toHaveAttribute(
      'src',
      'https://s3.test/keep/users/u/p2.webp?X-Amz-Signature=sig2',
    );
    for (const button of screen.getAllByRole('button')) {
      for (const attribute of button.getAttributeNames()) {
        expect(button.getAttribute(attribute)).not.toContain('X-Amz-Signature');
      }
    }
  });
});

describe.each(['card', 'row'] as const)(
  'SavedPhotoCard as a %s keeps the photo id out of the markup',
  (layout) => {
    it.each([
      ['default', true],
      ['other', false],
    ])('for the %s photo', (_kind, isDefault) => {
      const { container } = render(
        <SavedPhotoCard
          photo={photo(isDefault)}
          position={2}
          layout={layout}
          onMakeDefault={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      for (const element of container.querySelectorAll('*')) {
        for (const attribute of element.getAttributeNames()) {
          expect(element.getAttribute(attribute)).not.toContain(photo(isDefault).id);
        }
      }
    });
  },
);

describe('SavedPhotoCard as a row', () => {
  it('shows the default photo with the badge as text beside the thumbnail, not on it', () => {
    renderCard({ layout: 'row', photo: photo(true) });

    expect(screen.getByRole('img', { name: 'Фото 2' })).toBeInTheDocument();
    expect(within(screen.getByRole('figure')).queryByText('По умолчанию')).not.toBeInTheDocument();
    expect(screen.getByText('По умолчанию')).toBeInTheDocument();
    expect(screen.getByText('15 июня')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /основным/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('shows another photo with the text button «Сделать основным» that calls onMakeDefault and the events', async () => {
    const user = userEvent.setup();
    const events = { onClick: vi.fn() };
    const { onMakeDefault } = renderCard({ layout: 'row', makeDefaultEvents: events });

    expect(screen.queryByText('По умолчанию')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Сделать основным фото 2' });
    expect(button).toHaveTextContent('Сделать основным');
    await user.click(button);

    expect(onMakeDefault).toHaveBeenCalledTimes(1);
    expect(events.onClick).toHaveBeenCalledTimes(1);
  });

  it('is off while busy', async () => {
    const user = userEvent.setup();
    const { onMakeDefault } = renderCard({ layout: 'row', busy: true });

    const button = screen.getByRole('button', { name: 'Сделать основным фото 2' });
    expect(button).toBeDisabled();
    await user.click(button);

    expect(onMakeDefault).not.toHaveBeenCalled();
  });

  it('the bin calls onDelete', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderCard({ layout: 'row' });

    await user.click(screen.getByRole('button', { name: 'Удалить фото 2' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
