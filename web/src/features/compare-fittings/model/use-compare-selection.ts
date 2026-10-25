'use client';

import { useState } from 'react';

// Two entries are compared (spec 0019 board 9, A41).
export const COMPARE_MAX = 2;

export interface CompareSelection {
  // The selection mode is on: the cards show their boxes.
  active: boolean;
  // The chosen entries the list shows, in the order chosen; at most `COMPARE_MAX`.
  ids: string[];
  // Turns the mode on, with one entry already chosen («Сравнить с другой», A93.4).
  start: (id?: string) => void;
  cancel: () => void;
  // Chooses an entry or lets it go; a third one is not taken.
  toggle: (id: string) => void;
}

// The history's selection for the compare: kept by the page while it is open, never in the address.
// `selectable` is what the shown list can still compare: a chosen entry deleted meanwhile drops out
// of the choice, so the count and the link never name an entry that is gone.
export function useCompareSelection(selectable?: readonly string[]): CompareSelection {
  const [active, setActive] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const ids = selectable ? chosen.filter((id) => selectable.includes(id)) : chosen;
  return {
    active,
    ids,
    start: (id) => {
      setActive(true);
      setChosen(id === undefined ? [] : [id]);
    },
    cancel: () => {
      setActive(false);
      setChosen([]);
    },
    toggle: (id) => {
      if (ids.includes(id)) setChosen(ids.filter((other) => other !== id));
      else if (ids.length < COMPARE_MAX) setChosen([...ids, id]);
    },
  };
}
