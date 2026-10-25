'use client';

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { ChevronLeftIcon, ChevronRightIcon } from '../icon/icons';

import styles from './scroll-row.module.scss';

export type ScrollRowEvents = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerEnter' | 'onPointerLeave'
>;

export type ScrollDirection = 'prev' | 'next';

export interface ScrollRowProps {
  // The row's items, each an `<li>`.
  children: ReactNode;
  // The list's name for screen readers, when the section around it has none.
  'aria-label'?: string;
  className?: string;
  // The arrows' clicks and hovers, by direction (the page's analytics).
  events?: Partial<Record<ScrollDirection, ScrollRowEvents>>;
}

// Less than a pixel left is the end: a scaled page leaves fractions.
const EDGE = 1;

interface Edges {
  // Everything is in view: no arrows.
  fits: boolean;
  atStart: boolean;
  atEnd: boolean;
}

const FITS: Edges = { fits: true, atStart: true, atEnd: true };

function edgesOf(list: HTMLElement): Edges {
  const rest = list.scrollWidth - list.clientWidth;
  return {
    fits: rest <= EDGE,
    atStart: list.scrollLeft <= EDGE,
    atEnd: list.scrollLeft >= rest - EDGE,
  };
}

const ARROWS = { prev: ChevronLeftIcon, next: ChevronRightIcon } as const;
const LABELS = { prev: 'Предыдущие', next: 'Следующие' } as const;

// One row of items that scrolls sideways with snapping (spec 0019 A87.3: «С этим товаром
// выбирают»). How many are in view is the parent's: `--scroll-row-visible` (4 by default, a
// fraction shows part of the next one) and `--scroll-row-gap` set on `className`. From 600px «‹»
// and «›» over the row's sides scroll it by a view, disabled at either end and gone while
// everything fits; on a phone only a swipe.
export function ScrollRow({ children, 'aria-label': label, className, events }: ScrollRowProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Until measured, as the server renders it: no arrows.
  const [edges, setEdges] = useState<Edges>(FITS);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const next = edgesOf(list);
    // The same edges keep the state, so a smooth scroll does not render the row every frame.
    setEdges((prev) =>
      prev.fits === next.fits && prev.atStart === next.atStart && prev.atEnd === next.atEnd
        ? prev
        : next,
    );
  }, []);

  // The list's box and each item's: an item's width changes the list's scroll, its box may not.
  // Items added or removed are watched by a MutationObserver, so a render of the parent costs
  // nothing (spec 0019 A88).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    measure();
    // No observer (an old browser, jsdom): the first measure and the scrolls only.
    if (typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(measure);
    const observeItems = () => {
      resize.disconnect();
      resize.observe(list);
      for (const item of list.children) resize.observe(item);
    };
    observeItems();
    const mutation = new MutationObserver(() => {
      observeItems();
      measure();
    });
    mutation.observe(list, { childList: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [measure]);

  function scroll(direction: ScrollDirection) {
    const list = listRef.current;
    if (!list) return;
    // A view at a time; the snap settles on a whole item.
    list.scrollBy({ left: (direction === 'next' ? 1 : -1) * list.clientWidth });
  }

  function arrow(direction: ScrollDirection) {
    const Icon = ARROWS[direction];
    const disabled = direction === 'prev' ? edges.atStart : edges.atEnd;
    const tracked = events?.[direction];
    return (
      <button
        type="button"
        className={[styles.arrow, styles[direction]].join(' ')}
        aria-label={LABELS[direction]}
        // Not `disabled`: an arrow that turns off under the keyboard's focus at the row's end keeps
        // it, instead of dropping it to the page's start.
        aria-disabled={disabled}
        // A disabled arrow starts no hover; the leave stays, to cancel one started before.
        onPointerEnter={disabled ? undefined : tracked?.onPointerEnter}
        onPointerLeave={tracked?.onPointerLeave}
        onClick={(event) => {
          if (disabled) return;
          tracked?.onClick?.(event);
          scroll(direction);
        }}
      >
        <Icon />
      </button>
    );
  }

  return (
    <div className={[styles.row, className].filter(Boolean).join(' ')}>
      <ul ref={listRef} className={styles.list} aria-label={label} onScroll={measure}>
        {children}
      </ul>
      {!edges.fits && (
        <>
          {arrow('prev')}
          {arrow('next')}
        </>
      )}
    </div>
  );
}
