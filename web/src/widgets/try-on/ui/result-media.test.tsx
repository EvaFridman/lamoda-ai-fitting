import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Fitting } from '@/entities/fitting';

import { ResultPicture, ResultTiles } from './result-media';

vi.mock('@/shared/analytics', () => ({
  useTrackedElement: () => ({
    onClick: vi.fn(),
    onPointerEnter: vi.fn(),
    onPointerLeave: vi.fn(),
  }),
}));

const fitting = { resultUrl: 'https://s3.test/result.webp' } as unknown as Fitting;

function Both({ resultUrl }: { resultUrl: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = { resultUrl } as unknown as Fitting;
  return (
    <>
      <ResultPicture
        fitting={shown}
        running={null}
        progress={null}
        alt="Результат"
        pictureRef={ref}
      />
      <ResultTiles fitting={shown} running={null} pictureRef={ref} phone={false} />
    </>
  );
}

describe('ResultTiles', () => {
  it('opens the picture frame full screen', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    const user = userEvent.setup();
    render(<Both resultUrl={fitting.resultUrl} />);
    const frame = screen.getByRole('img', { name: 'Результат' }).parentElement as HTMLElement;
    expect(frame).toHaveClass('mp-block');
    expect(frame).toHaveTextContent('Сгенерировано ИИ');

    await user.click(screen.getByRole('button', { name: 'Во весь экран' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toBe(frame);
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
  });

  it('is disabled while the result has no link', () => {
    render(<Both resultUrl={null} />);

    expect(screen.getByRole('button', { name: 'Во весь экран' })).toBeDisabled();
  });
});
