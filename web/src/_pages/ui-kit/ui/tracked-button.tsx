'use client';

import { type TrackedElement, useTrackedElement } from '@/shared/analytics';
import { Button, type ButtonAsButtonProps } from '@/shared/ui';

// The tracking handlers take the place of these, so a caller cannot pass them.
interface TrackedButtonProps extends Omit<
  ButtonAsButtonProps,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
> {
  element: TrackedElement;
}

// A Button that sends its click and hover events: the element the analytics checks use (spec 0008
// plan §8), on a page hidden from search.
export function TrackedButton({ element, ...button }: TrackedButtonProps) {
  return <Button {...button} {...useTrackedElement(element)} />;
}
