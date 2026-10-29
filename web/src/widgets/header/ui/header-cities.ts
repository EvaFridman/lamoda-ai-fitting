import { cache } from 'react';

import { type City, storeCities } from '@/entities/store';
import { getStores } from '@/entities/store/server';
import { reportFailure } from '@/shared/api';

// The stores' cities for the header's button and the burger's row (spec 0026 plan §4): the page
// cache's stores list, once per render, reduced to the names and points, so no store's description,
// hours or phones reach the page. A failure is `null`: the window then says the read failed, in the
// general text, since an `ApiError` does not cross to the browser and a server read's cause is not
// the visitor's network; the api layer has reported an api failure, `reportFailure` anything else.
export const loadHeaderCities = cache(async (): Promise<City[] | null> => {
  try {
    return storeCities(await getStores());
  } catch (error) {
    reportFailure(error);
    return null;
  }
});
