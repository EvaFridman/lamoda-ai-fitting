// Example data of the catalog sections, shaped like the api's answers (spec 0009, K14): products
// and filter counts of the seed's catalog as production serves them, except where a case needs
// otherwise (a null rating, a long name, a colour with no hex). The page has no api, so the
// photos are production's /media/ addresses (the schema wants absolute URLs); `catalog.test.ts`
// checks everything here against web's schemas (AC12).

import type { ProductFacets, ProductListItem } from '@/entities/product';

const media = 'https://lamoda-ai-fitting.ru/media/seed/products';

const brands = {
  brisko: { id: '01a1187a-a4f2-76e5-aa50-884a46c3c15c', name: 'Brisko' },
  lumora: { id: '01a1187a-a4f2-7090-b295-44212db69a82', name: 'Lumora' },
  ostrova: { id: '01a1187a-a4f2-772c-b90b-3571fc2c9f77', name: 'Ostrova' },
  tervana: { id: '01a1187a-a4f2-768a-9a9f-ee039506808c', name: 'Tervana' },
  vellmar: { id: '01a1187a-a4f2-770c-b2ac-10689367144d', name: 'Vellmar' },
};

const categories = {
  dresses: { id: '01a1187a-a4ea-7df2-b019-82b1f391ae8f', name: 'Платья', slug: 'dresses' },
  jeans: { id: '01a1187a-a4eb-7791-9ebc-5f1e7dd2c00f', name: 'Джинсы', slug: 'jeans' },
  outerwear: {
    id: '01a1187a-a4eb-783b-8951-95c52e119bef',
    name: 'Верхняя одежда',
    slug: 'outerwear',
  },
};

// One card per case of the card section (AC4), in its order.
export const catalogProducts = {
  discounted: {
    id: '01a1187a-a518-7e02-9435-3375afff12c3',
    article: 'LMR-DR-001',
    name: 'Платье-бюстье миди',
    brand: brands.lumora,
    category: categories.dresses,
    image: { url: `${media}/LMR-DR-001/1.webp` },
    price: 5990,
    discount: 20,
    finalPrice: 4792,
    rating: 4.7,
    createdAt: '2026-10-07T22:27:33.272Z',
  },
  fullPrice: {
    id: '01a1187a-a54d-7c88-a425-8e1c6ffe7e79',
    article: 'BRS-JN-001',
    name: 'Джинсы прямого кроя',
    brand: brands.brisko,
    category: categories.jeans,
    image: { url: `${media}/BRS-JN-001/1.webp` },
    price: 4990,
    discount: 0,
    finalPrice: 4990,
    rating: 4.6,
    createdAt: '2026-10-07T22:27:33.325Z',
  },
  noPhoto: {
    id: '01a1187a-a584-7d90-a01b-fe2f608564b7',
    article: 'OST-OW-002',
    name: 'Пальто оверсайз',
    brand: brands.ostrova,
    category: categories.outerwear,
    image: null,
    price: 13490,
    discount: 0,
    finalPrice: 13490,
    rating: 4.6,
    createdAt: '2026-10-07T22:27:33.380Z',
  },
  noRating: {
    id: '01a1187a-a52b-7fae-8e5c-2357779b9b95',
    article: 'TRV-DR-003',
    name: 'Платье макси на бретелях',
    brand: brands.tervana,
    category: categories.dresses,
    image: { url: `${media}/TRV-DR-003/1.webp` },
    price: 3990,
    discount: 30,
    finalPrice: 2793,
    rating: null,
    createdAt: '2026-10-07T22:27:33.291Z',
  },
  longName: {
    id: '01a1187a-a57c-7ff9-b9bb-a38063e7ac7a',
    article: 'VLM-OW-001',
    name: 'Пальто-тренч двубортное с поясом, погонами и съёмной утеплённой подкладкой на молнии',
    brand: brands.vellmar,
    category: categories.outerwear,
    image: { url: `${media}/VLM-OW-001/1.webp` },
    price: 15990,
    discount: 20,
    finalPrice: 12792,
    rating: 4.9,
    createdAt: '2026-10-07T22:27:33.372Z',
  },
} satisfies Record<string, ProductListItem>;

// The filter counts of the whole catalog, as GET /products/facets answers: attributes and sizes
// in the api's order (by name and by text), so the size filter shows its own order (AC8). The
// colour "разноцветный" has no hex, unlike the seed's colours, to show a value without a swatch
// (AC6).
export const catalogFacets: ProductFacets = {
  total: 30,
  discounted: 20,
  price: { min: 990, max: 18990 },
  categories: [
    { id: categories.dresses.id, name: 'Платья', count: 5 },
    { id: categories.jeans.id, name: 'Джинсы', count: 5 },
    { id: categories.outerwear.id, name: 'Верхняя одежда', count: 5 },
    { id: '01a1187a-a4eb-7862-98fc-d6d0085ba4c1', name: 'Футболки', count: 5 },
    { id: '01a1187a-a4eb-7885-ba4b-fcd9e2772bef', name: 'Толстовки и худи', count: 5 },
    { id: '01a1187a-a4eb-78e3-bdc2-ae16893d3401', name: 'Обувь', count: 5 },
  ],
  brands: [
    { ...brands.brisko, count: 7 },
    { ...brands.lumora, count: 6 },
    { ...brands.ostrova, count: 6 },
    { ...brands.tervana, count: 6 },
    { ...brands.vellmar, count: 5 },
  ],
  sizes: [
    { size: '26', count: 3 },
    { size: '28', count: 5 },
    { size: '30', count: 5 },
    { size: '32', count: 5 },
    { size: '34', count: 3 },
    { size: 'L', count: 18 },
    { size: 'M', count: 18 },
    { size: 'S', count: 20 },
    { size: 'XL', count: 13 },
    { size: 'XS', count: 11 },
  ],
  attributes: [
    {
      id: '01a1187a-a4f6-7e10-8334-8e33a667eecd',
      name: 'Материал',
      values: [
        { id: '01a1187a-a500-72a1-8d8f-a7f64ce026e3', value: 'деним', colorHex: null, count: 6 },
        { id: '01a1187a-a500-72fe-babf-cc334575bd25', value: 'кожа', colorHex: null, count: 5 },
        { id: '01a1187a-a500-72b7-b2fd-756136dc5e34', value: 'лён', colorHex: null, count: 1 },
        {
          id: '01a1187a-a500-72e4-b37d-b20c28295889',
          value: 'полиэстер',
          colorHex: null,
          count: 3,
        },
        { id: '01a1187a-a500-728c-b7f8-1bac038999b3', value: 'хлопок', colorHex: null, count: 12 },
        { id: '01a1187a-a500-72ce-a92f-e67eec38b91d', value: 'шерсть', colorHex: null, count: 3 },
      ],
    },
    {
      id: '01a1187a-a4f6-7e63-a0c4-51ac873948b6',
      name: 'Сезон',
      values: [
        {
          id: '01a1187a-a500-7355-a308-aa4790ad2b2a',
          value: 'всесезон',
          colorHex: null,
          count: 10,
        },
        {
          id: '01a1187a-a500-7329-8a06-34a80469bae4',
          value: 'демисезон',
          colorHex: null,
          count: 10,
        },
        { id: '01a1187a-a500-733f-923f-f61186cda584', value: 'зима', colorHex: null, count: 2 },
        { id: '01a1187a-a500-7314-ad8a-4199c903209b', value: 'лето', colorHex: null, count: 8 },
      ],
    },
    {
      id: '01a1187a-a4f6-79e5-aefd-e6c57a0e47af',
      name: 'Цвет',
      values: [
        {
          id: '01a1187a-a500-71b1-ab74-0ef336e18f1c',
          value: 'бежевый',
          colorHex: '#DFBD93',
          count: 1,
        },
        {
          id: '01a1187a-a500-711e-a857-a6865c073e5f',
          value: 'белый',
          colorHex: '#FFFFFF',
          count: 5,
        },
        {
          id: '01a1187a-a500-7195-b514-7ddde210b0b5',
          value: 'голубой',
          colorHex: '#8BCDFF',
          count: 4,
        },
        {
          id: '01a1187a-a500-7215-adb2-6f0c183405eb',
          value: 'жёлтый',
          colorHex: '#FFEC1C',
          count: 1,
        },
        {
          id: '01a1187a-a500-71cc-a552-2763eade2536',
          value: 'зелёный',
          colorHex: '#3DB801',
          count: 3,
        },
        {
          id: '01a1187a-a500-71fe-be10-ead507163641',
          value: 'коричневый',
          colorHex: '#743D02',
          count: 2,
        },
        {
          id: '01a1187a-a500-7272-ba31-147112677f29',
          value: 'оранжевый',
          colorHex: '#FF7A01',
          count: 1,
        },
        {
          id: '01a1187a-a500-7290-8c4e-5d1b9a7f3e20',
          value: 'разноцветный',
          colorHex: null,
          count: 2,
        },
        {
          id: '01a1187a-a500-71e5-b573-a361bd462525',
          value: 'серый',
          colorHex: '#B6B6B6',
          count: 4,
        },
        {
          id: '01a1187a-a500-7172-8fc9-59e52a3f0d2f',
          value: 'синий',
          colorHex: '#3972FC',
          count: 3,
        },
        {
          id: '01a1187a-a4ff-7b50-a6fd-b28ddefe4133',
          value: 'чёрный',
          colorHex: '#000000',
          count: 6,
        },
      ],
    },
  ],
};
