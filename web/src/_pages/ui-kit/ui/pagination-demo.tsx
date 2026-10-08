'use client';

import { useState } from 'react';

import { Pagination } from '@/shared/ui';

const total = 95;
const perPage = 10;
const pageCount = Math.ceil(total / perPage);

// Pagination as buttons, live: a page number shows that page, "Показать ещё" adds the next one
// under the pages already shown, and the counter follows.
export function PaginationDemo() {
  // The pages on screen, from the first to the last; "Показать ещё" moves only the last.
  const [pages, setPages] = useState({ first: 1, last: 1 });
  const shown = Math.min(pages.last * perPage, total) - (pages.first - 1) * perPage;

  return (
    <Pagination
      page={pages.last}
      pageCount={pageCount}
      onPageChange={(page) => setPages({ first: page, last: page })}
      onShowMore={() => setPages(({ first, last }) => ({ first, last: last + 1 }))}
      shown={shown}
      total={total}
    />
  );
}
