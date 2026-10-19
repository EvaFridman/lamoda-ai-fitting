import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SessionUserBadge } from './session-user';

function attributeValues(container: HTMLElement): string[] {
  return [container, ...container.querySelectorAll('*')].flatMap((element) =>
    Array.from(element.attributes, (attribute) => attribute.value),
  );
}

describe('SessionUserBadge', () => {
  it('shows the initial and the name', () => {
    render(<SessionUserBadge user={{ id: '1', email: 'anna@example.com', name: 'Анна' }} />);
    expect(screen.getByText('Анна')).toBeInTheDocument();
    expect(screen.getByText('А')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the email first letter and "Профиль" for a user without a name', () => {
    render(<SessionUserBadge user={{ id: '1', email: 'zoe@example.com', name: null }} />);
    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('Профиль')).toBeInTheDocument();
  });

  it('renders the email nowhere and the name in no attribute', () => {
    const { container } = render(
      <SessionUserBadge user={{ id: 'id-1', email: 'anna@example.com', name: 'Анна' }} />,
    );
    expect(container).not.toHaveTextContent('anna@example.com');
    expect(container).not.toHaveTextContent('example');
    const values = attributeValues(container);
    expect(values.some((value) => value.includes('Анна'))).toBe(false);
    expect(values.some((value) => value.includes('example.com'))).toBe(false);
  });
});
