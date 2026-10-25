import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TriedOnNote } from './tried-on-note';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const RESULT = 'https://s3.test/keep/users/u/r.webp?X-Amz-Signature=sig';
const PRODUCT = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const HREF = '/customer/fittings?fitting=f1';

function item(productId: string, colour: string | null) {
  return {
    productId,
    name: 'Рубашка',
    brand: 'Annen',
    imageUrl: null,
    price: 1000,
    finalPrice: 900,
    attributeValueId: null,
    colour,
    slot: 'top' as const,
  };
}

function fitting(items = [item(PRODUCT, 'белый')], resultUrl: string | null = RESULT) {
  return { items, resultUrl, createdAt: '2026-10-24T11:06:00.000Z' };
}

describe('TriedOnNote', () => {
  it('is a link to the fitting with «Вы это примеряли», the date, the colour and «Смотреть»', () => {
    render(<TriedOnNote fitting={fitting()} productId={PRODUCT} href={HREF} now={NOW} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', HREF);
    expect(screen.getByRole('link')).toHaveClass('mp-block');
    expect(screen.getByText('Вы это примеряли')).toBeInTheDocument();
    expect(screen.getByText('Сегодня, 14:06 · белый')).toBeInTheDocument();
    expect(screen.getByText('Смотреть')).toBeInTheDocument();
  });

  it('takes the colour of the item whose product is the page’s', () => {
    const look = fitting([item(OTHER, 'чёрный'), item(PRODUCT, 'синий')]);
    render(<TriedOnNote fitting={look} productId={PRODUCT} href={HREF} now={NOW} />);

    expect(screen.getByText('Сегодня, 14:06 · синий')).toBeInTheDocument();
  });

  it('leaves the colour out when the item has none', () => {
    render(
      <TriedOnNote
        fitting={fitting([item(PRODUCT, null)])}
        productId={PRODUCT}
        href={HREF}
        now={NOW}
      />,
    );

    expect(screen.getByText('Сегодня, 14:06')).toBeInTheDocument();
  });

  it('writes an earlier day as a date', () => {
    const old = { ...fitting(), createdAt: '2026-10-12T11:06:00.000Z' };
    render(<TriedOnNote fitting={old} productId={PRODUCT} href={HREF} now={NOW} />);

    expect(screen.getByText('12 октября · белый')).toBeInTheDocument();
  });

  it('puts the result link only into the image src, inside an mp-block container', () => {
    const { container } = render(
      <TriedOnNote fitting={fitting()} productId={PRODUCT} href={HREF} now={NOW} />,
    );

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', RESULT);
    expect(image?.closest('.mp-block')).not.toBeNull();
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.getAttributeNames()) {
        if (element === image && attribute === 'src') continue;
        expect(element.getAttribute(attribute)).not.toContain('X-Amz-Signature');
        expect(element.getAttribute(attribute)).not.toContain('s3.test');
      }
    }
  });

  it('draws no image for a result without a link', () => {
    const { container } = render(
      <TriedOnNote fitting={fitting(undefined, null)} productId={PRODUCT} href={HREF} now={NOW} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.mp-block')).not.toBeNull();
  });

  it('reports a click through the given events', async () => {
    const onClick = vi.fn((event: MouseEvent) => event.preventDefault());
    render(
      <TriedOnNote
        fitting={fitting()}
        productId={PRODUCT}
        href={HREF}
        events={{ onClick }}
        now={NOW}
      />,
    );

    await userEvent.setup().click(screen.getByRole('link'));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
