import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UserInitials } from './user-initials';

describe('UserInitials', () => {
  const user = { firstName: 'Ева', lastName: 'Фридман', email: 'eva.secret@example.com' };

  it('renders the initials as text, hidden from screen readers', () => {
    const { container } = render(<UserInitials user={user} />);
    const element = container.firstElementChild as HTMLElement;
    expect(element).toHaveTextContent('ЕФ');
    expect(element).toHaveAttribute('aria-hidden', 'true');
  });

  it('is an mp-block, so recordings skip it', () => {
    const { container } = render(<UserInitials user={user} />);
    expect(container.firstElementChild).toHaveClass('mp-block');
  });

  it('keeps personal data out of every attribute', () => {
    const { container } = render(<UserInitials user={user} />);
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.value).not.toMatch(/Ева|Фридман|ЕФ|secret|example/);
      }
    }
  });

  it('shows the email letter when there are no names', () => {
    const { container } = render(
      <UserInitials user={{ firstName: null, lastName: null, email: 'zoe@example.com' }} />,
    );
    expect(container.firstElementChild).toHaveTextContent('Z');
  });
});
