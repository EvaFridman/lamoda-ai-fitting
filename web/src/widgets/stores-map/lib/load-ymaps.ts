import type { ReactifiedModule } from '@yandex/ymaps3-types/reactify';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

type Ymaps3 = typeof import('@yandex/ymaps3-types');
type ClustererModule = typeof import('@yandex/ymaps3-clusterer');

// Yandex Maps' components as React components (plan §3.2).
export interface YmapsComponents {
  map: ReactifiedModule<Ymaps3>;
  clusterer: ReactifiedModule<ClustererModule>;
  // A plain function, not an entity: reactify would type it as a component.
  clusterByGrid: ClustererModule['clusterByGrid'];
}

// Version 3 of the JavaScript API, the one origin and path the stores page's policy allows for
// scripts (spec 0022 X16, X23).
export const YMAPS_SCRIPT = 'https://api-maps.yandex.ru/v3/';

// A load that has not finished by then fails, so the page shows «Карта недоступна» instead of an
// empty grey box (AC10).
export const LOAD_TIMEOUT_MS = 15_000;

let loading: Promise<YmapsComponents> | null = null;

// Loads Yandex Maps once per tab: one script tag, then `ymaps3.ready`, Yandex's reactify module
// (from the same origin, through `ymaps3.import`) and the clusterer from npm, which extends the
// global `ymaps3` when evaluated, so only after `ready`. A failure is forgotten, so the next map
// on the page tries again.
export function loadYmaps(apiKey: string): Promise<YmapsComponents> {
  loading ??= withTimeout(load(apiKey)).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Yandex Maps timed out')), LOAD_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function load(apiKey: string): Promise<YmapsComponents> {
  // A script already in (an earlier try whose `ready` or modules failed) is not added again.
  if (typeof ymaps3 === 'undefined') {
    const url = new URL(YMAPS_SCRIPT);
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('lang', 'ru_RU');
    await appendScript(url.href);
  }
  await ymaps3.ready;
  const [reactifyModule, clustererModule] = await Promise.all([
    ymaps3.import('@yandex/ymaps3-reactify'),
    import('@yandex/ymaps3-clusterer'),
  ]);
  const reactify = reactifyModule.reactify.bindTo(React, ReactDOM);
  return {
    map: reactify.module(ymaps3),
    clusterer: reactify.module(clustererModule),
    clusterByGrid: clustererModule.clusterByGrid,
  };
}

function appendScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(new Error('Yandex Maps did not load'));
      },
      { once: true },
    );
    document.head.append(script);
  });
}
