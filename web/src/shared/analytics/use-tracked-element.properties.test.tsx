import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from './client';
import {
  HOVER_MS,
  hoverKey,
  useTrackedElement,
  type UseTrackedElementOf,
} from './use-tracked-element';

const pathname = vi.hoisted(() => ({ current: '/a' }));

const { testCatalog } = await vi.hoisted(async () => {
  const { defineCatalog } = await import('./catalog');
  const testCatalog = defineCatalog({
    visitsPerMonth: 1,
    sdkPerVisit: 1,
    zones: { shop: { title: 'Shop', areas: ['card'], description: 'Test zone' } },
    commonEvents: {
      'Element Clicked': { description: 'click' },
      'Element Hovered': { description: 'hover' },
    },
    events: {},
    elements: {
      'card.open': {
        zone: 'shop',
        type: 'navigation',
        description: 'A card',
        clicksPerVisit: 1,
        hoversPerVisit: 1,
        properties: { position: { kind: 'number' }, sale: { kind: 'boolean' } },
      },
      'card.plain': {
        zone: 'shop',
        type: 'interaction',
        description: 'No properties',
        clicksPerVisit: 1,
        hoversPerVisit: 1,
      },
    },
  });
  return { testCatalog };
});

vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('./client', () => ({ track: vi.fn() }));
vi.mock('./catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalog')>()),
  catalog: testCatalog,
}));

const useTestElement = useTrackedElement as unknown as UseTrackedElementOf<typeof testCatalog>;

function Card({ position }: { position: number }) {
  const props = useTestElement('card.open', { position, sale: true });
  return (
    <button type="button" {...props}>
      {`card ${position}`}
    </button>
  );
}

function Plain() {
  const props = useTestElement('card.plain');
  return (
    <button type="button" {...props}>
      plain
    </button>
  );
}

function hover(name: string) {
  fireEvent.pointerEnter(screen.getByRole('button', { name }), { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(HOVER_MS));
}

describe('hoverKey', () => {
  it('is the element alone when it has no properties', () => {
    expect(hoverKey<typeof testCatalog, 'card.plain'>('card.plain', {}, testCatalog)).toBe(
      JSON.stringify(['card.plain']),
    );
  });

  it('follows the catalog order of properties, not the object order', () => {
    const catalogOrder = hoverKey<typeof testCatalog, 'card.open'>(
      'card.open',
      { position: 1, sale: true },
      testCatalog,
    );
    const otherOrder = hoverKey<typeof testCatalog, 'card.open'>(
      'card.open',
      { sale: true, position: 1 },
      testCatalog,
    );
    expect(otherOrder).toBe(catalogOrder);
    expect(catalogOrder).toBe(JSON.stringify(['card.open', 1, true]));
  });

  it('differs for different values and matches for the same ones', () => {
    const key = (position: number) =>
      hoverKey<typeof testCatalog, 'card.open'>(
        'card.open',
        { position, sale: false },
        testCatalog,
      );
    expect(key(1)).not.toBe(key(2));
    expect(key(1)).toBe(key(1));
  });
});

let testNumber = 0;

describe('useTrackedElement with properties', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(track).mockClear();
    testNumber += 1;
    pathname.current = `/props-${testNumber}`;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends Element Clicked with element, zone, type and the properties', () => {
    render(<Card position={3} />);
    fireEvent.click(screen.getByRole('button'));
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'card.open',
      zone: 'shop',
      type: 'navigation',
      position: 3,
      sale: true,
    });
  });

  it('sends a hover per property values: positions 1 and 2, not 1 again', () => {
    render(
      <>
        <Card position={1} />
        <Card position={2} />
      </>,
    );
    hover('card 1');
    hover('card 2');
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenNthCalledWith(1, 'Element Hovered', {
      element: 'card.open',
      zone: 'shop',
      type: 'navigation',
      position: 1,
      sale: true,
    });
    expect(track).toHaveBeenNthCalledWith(
      2,
      'Element Hovered',
      expect.objectContaining({ position: 2 }),
    );

    hover('card 1');
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('sends the same hover again after the path changes', () => {
    const { rerender } = render(<Card position={1} />);
    hover('card 1');
    expect(track).toHaveBeenCalledTimes(1);

    pathname.current += '/next';
    rerender(<Card position={1} />);
    hover('card 1');
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('keeps the behavior of an element without properties', () => {
    render(<Plain />);
    fireEvent.click(screen.getByRole('button'));
    expect(track).toHaveBeenCalledWith('Element Clicked', {
      element: 'card.plain',
      zone: 'shop',
      type: 'interaction',
    });
    hover('plain');
    hover('plain');
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('Element Hovered', {
      element: 'card.plain',
      zone: 'shop',
      type: 'interaction',
    });
  });

  describe('with an object that carries more than its type shows', () => {
    const useLoose = useTrackedElement as unknown as (
      element: string,
      properties: object,
    ) => ReturnType<typeof useTestElement>;

    function Loose({ element, passed }: { element: string; passed: object }) {
      const props = useLoose(element, passed);
      return (
        <button type="button" {...props}>
          loose
        </button>
      );
    }

    it('sends only the declared properties on click and hover', () => {
      const passed = { position: 1, sale: true, title: 'Имя' } as { position: number; sale: true };
      render(<Loose element="card.open" passed={passed} />);
      const expected = {
        element: 'card.open',
        zone: 'shop',
        type: 'navigation',
        position: 1,
        sale: true,
      };

      fireEvent.click(screen.getByRole('button'));
      expect(track).toHaveBeenLastCalledWith('Element Clicked', expected);
      hover('loose');
      expect(track).toHaveBeenLastCalledWith('Element Hovered', expected);
    });

    it('sends only element, zone and type for an element without properties', () => {
      render(<Loose element="card.plain" passed={{ position: 1, title: 'Имя' }} />);
      const expected = { element: 'card.plain', zone: 'shop', type: 'interaction' };

      fireEvent.click(screen.getByRole('button'));
      expect(track).toHaveBeenLastCalledWith('Element Clicked', expected);
      hover('loose');
      expect(track).toHaveBeenLastCalledWith('Element Hovered', expected);
    });

    it('takes element, zone and type from the catalog, not from the object', () => {
      render(
        <Loose
          element="card.open"
          passed={{ position: 2, sale: false, element: 'x', zone: 'y', type: 'z' }}
        />,
      );
      const expected = {
        element: 'card.open',
        zone: 'shop',
        type: 'navigation',
        position: 2,
        sale: false,
      };

      fireEvent.click(screen.getByRole('button'));
      expect(track).toHaveBeenLastCalledWith('Element Clicked', expected);
      hover('loose');
      expect(track).toHaveBeenLastCalledWith('Element Hovered', expected);
    });
  });
});
