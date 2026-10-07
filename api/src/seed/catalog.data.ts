// The demo catalog the seed loads (spec 0002, C5): invented brands and products, no users.
// Articles and image keys are fixed here; web/public/media/<key> holds the images, cut from the
// Unsplash photo each product names (C9d): image 1 the whole garment, the others closer crops. The
// product's kind, colour and name follow its photo (C9g). Change an article only together with its
// image files: a reseed never touches an existing product, so the old row and files would stay.

export type GarmentKind =
  'dress' | 'jeans' | 'jacket' | 'coat' | 't-shirt' | 'hoodie' | 'sneakers' | 'boots';

export interface SeedCategory {
  name: string;
  slug: string;
  sortOrder: number;
}

export interface SeedAttribute {
  name: string;
  values: string[];
}

// The Unsplash photo a product's images are cut from (Unsplash License). Kept for the record only:
// the seed does not store it.
export interface SeedPhoto {
  url: string;
  author: string;
}

export interface SeedProduct {
  article: string;
  photo: SeedPhoto;
  name: string;
  description: string;
  kind: GarmentKind;
  brand: string;
  categorySlug: string;
  price: number;
  discount: number;
  rating: number;
  // Attribute name → value; each value is listed in its attribute below.
  attributes: Record<string, string>;
  sizes: { size: string; stock: number }[];
  imageCount: number;
}

export interface SeedCatalog {
  categories: SeedCategory[];
  brands: string[];
  attributes: SeedAttribute[];
  products: SeedProduct[];
}

export const COLOUR = 'Цвет';
export const MATERIAL = 'Материал';
export const SEASON = 'Сезон';

// Object key of a product's n-th image (1-based), relative to the media root (C9, C22).
export function imageKey(article: string, n: number): string {
  return `seed/products/${article}/${n}.webp`;
}

export function imageKeys(product: SeedProduct): string[] {
  return Array.from({ length: product.imageCount }, (_, i) => imageKey(product.article, i + 1));
}

const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const JEANS_SIZES = ['26', '28', '30', '32', '34'];
const SHOE_SIZES = ['37', '38', '39', '40', '41', '42', '43', '44'];

// `count` consecutive sizes of a scale from `from`, with stock that varies but stays fixed between
// runs (the seed must produce the same data every time).
function sizes(scale: string[], from: string, count: number, seed: number) {
  const start = scale.indexOf(from);
  return scale
    .slice(start, start + count)
    .map((size, i) => ({ size, stock: (seed * 7 + i * 5) % 23 }));
}

interface ProductRow {
  article: string;
  photo: SeedPhoto;
  name: string;
  description: string;
  kind: GarmentKind;
  brand: string;
  categorySlug: string;
  price: number;
  discount: number;
  rating: number;
  colour: string;
  material: string;
  season: string;
  sizes: { size: string; stock: number }[];
  imageCount?: number;
}

function product(row: ProductRow): SeedProduct {
  const { colour, material, season, imageCount = 3, ...rest } = row;
  return {
    ...rest,
    attributes: { [COLOUR]: colour, [MATERIAL]: material, [SEASON]: season },
    imageCount,
  };
}

export const CATALOG: SeedCatalog = {
  categories: [
    { name: 'Платья', slug: 'dresses', sortOrder: 0 },
    { name: 'Джинсы', slug: 'jeans', sortOrder: 1 },
    { name: 'Верхняя одежда', slug: 'outerwear', sortOrder: 2 },
    { name: 'Футболки', slug: 't-shirts', sortOrder: 3 },
    { name: 'Толстовки и худи', slug: 'hoodies', sortOrder: 4 },
    { name: 'Обувь', slug: 'shoes', sortOrder: 5 },
  ],
  brands: ['Lumora', 'Tervana', 'Brisko', 'Vellmar', 'Ostrova'],
  attributes: [
    {
      name: COLOUR,
      values: [
        'чёрный',
        'белый',
        'синий',
        'голубой',
        'бежевый',
        'зелёный',
        'серый',
        'коричневый',
        'жёлтый',
        'оранжевый',
      ],
    },
    { name: MATERIAL, values: ['хлопок', 'деним', 'лён', 'шерсть', 'полиэстер', 'кожа'] },
    { name: SEASON, values: ['лето', 'демисезон', 'зима', 'всесезон'] },
  ],
  products: [
    // Dresses
    product({
      article: 'LMR-DR-001',
      photo: { url: 'https://unsplash.com/photos/pHA6KL_HpoE', author: 'Alessandra Caretto' },
      name: 'Платье-бюстье миди',
      description: 'Платье миди с вырезом-сердечком и поясом.',
      kind: 'dress',
      brand: 'Lumora',
      categorySlug: 'dresses',
      price: 5990,
      discount: 20,
      rating: 4.7,
      colour: 'белый',
      material: 'полиэстер',
      season: 'всесезон',
      sizes: sizes(LETTER_SIZES, 'XS', 5, 1),
    }),
    product({
      article: 'LMR-DR-002',
      photo: { url: 'https://unsplash.com/photos/7tDTX5PU5mw', author: 'Nellie Adamyan' },
      name: 'Сарафан на бретелях',
      description: 'Короткий сарафан на широких бретелях с кантом.',
      kind: 'dress',
      brand: 'Lumora',
      categorySlug: 'dresses',
      price: 4490,
      discount: 0,
      rating: 4.4,
      colour: 'зелёный',
      material: 'хлопок',
      season: 'лето',
      sizes: sizes(LETTER_SIZES, 'S', 4, 2),
    }),
    product({
      article: 'TRV-DR-003',
      photo: { url: 'https://unsplash.com/photos/P7PTwHhtfsw', author: 'Pew Nguyen' },
      name: 'Платье макси на бретелях',
      description: 'Длинное летнее платье на тонких бретелях.',
      kind: 'dress',
      brand: 'Tervana',
      categorySlug: 'dresses',
      price: 3990,
      discount: 30,
      rating: 4.2,
      colour: 'серый',
      material: 'хлопок',
      season: 'лето',
      sizes: sizes(LETTER_SIZES, 'XS', 4, 3),
      imageCount: 2,
    }),
    product({
      article: 'VLM-DR-004',
      photo: { url: 'https://unsplash.com/photos/cp-VMJ-mdKs', author: 'H&CO' },
      name: 'Платье-футляр без рукавов',
      description: 'Строгое платье-футляр без рукавов длиной до колена.',
      kind: 'dress',
      brand: 'Vellmar',
      categorySlug: 'dresses',
      price: 7490,
      discount: 10,
      rating: 4.8,
      colour: 'чёрный',
      material: 'полиэстер',
      season: 'всесезон',
      sizes: sizes(LETTER_SIZES, 'XS', 5, 4),
    }),
    product({
      article: 'OST-DR-005',
      photo: { url: 'https://unsplash.com/photos/TaJQaxEkpq0', author: 'Sandra Seitamaa' },
      name: 'Платье с цветочным узором',
      description: 'Платье без рукавов с пышной юбкой и цветочным узором.',
      kind: 'dress',
      brand: 'Ostrova',
      categorySlug: 'dresses',
      price: 6290,
      discount: 15,
      rating: 4.5,
      colour: 'серый',
      material: 'хлопок',
      season: 'лето',
      sizes: sizes(LETTER_SIZES, 'S', 3, 5),
      imageCount: 2,
    }),

    // Jeans
    product({
      article: 'BRS-JN-001',
      photo: { url: 'https://unsplash.com/photos/u-TajA5X5rg', author: 'TuanAnh Blue' },
      name: 'Джинсы прямого кроя',
      description: 'Классические джинсы прямого кроя со средней посадкой.',
      kind: 'jeans',
      brand: 'Brisko',
      categorySlug: 'jeans',
      price: 4990,
      discount: 0,
      rating: 4.6,
      colour: 'синий',
      material: 'деним',
      season: 'всесезон',
      sizes: sizes(JEANS_SIZES, '26', 5, 6),
    }),
    product({
      article: 'BRS-JN-002',
      photo: { url: 'https://unsplash.com/photos/aWLTXw6kbDw', author: 'Claire Abdo' },
      name: 'Джинсы мом',
      description: 'Джинсы мом с высокой посадкой и зауженным низом.',
      kind: 'jeans',
      brand: 'Brisko',
      categorySlug: 'jeans',
      price: 4590,
      discount: 25,
      rating: 4.3,
      colour: 'голубой',
      material: 'деним',
      season: 'всесезон',
      sizes: sizes(JEANS_SIZES, '26', 4, 7),
    }),
    product({
      article: 'TRV-JN-003',
      photo: { url: 'https://unsplash.com/photos/h6PKsr0wDH4', author: 'TuanAnh Blue' },
      name: 'Джинсы широкие',
      description: 'Широкие джинсы свободного кроя с высокой посадкой.',
      kind: 'jeans',
      brand: 'Tervana',
      categorySlug: 'jeans',
      price: 5290,
      discount: 10,
      rating: 4.5,
      colour: 'чёрный',
      material: 'деним',
      season: 'всесезон',
      sizes: sizes(JEANS_SIZES, '28', 4, 8),
      imageCount: 2,
    }),
    product({
      article: 'OST-JN-004',
      photo: { url: 'https://unsplash.com/photos/muo8Zdkz_4w', author: 'TuanAnh Blue' },
      name: 'Джинсы скинни',
      description: 'Облегающие джинсы скинни из эластичного денима.',
      kind: 'jeans',
      brand: 'Ostrova',
      categorySlug: 'jeans',
      price: 3790,
      discount: 0,
      rating: 4.1,
      colour: 'чёрный',
      material: 'деним',
      season: 'всесезон',
      sizes: sizes(JEANS_SIZES, '26', 5, 9),
    }),
    product({
      article: 'VLM-JN-005',
      photo: { url: 'https://unsplash.com/photos/KVHIG5biScQ', author: 'TuanAnh Blue' },
      name: 'Джинсы бойфренды',
      description: 'Свободные джинсы бойфренды с подворотами.',
      kind: 'jeans',
      brand: 'Vellmar',
      categorySlug: 'jeans',
      price: 5690,
      discount: 15,
      rating: 4.4,
      colour: 'голубой',
      material: 'деним',
      season: 'всесезон',
      sizes: sizes(JEANS_SIZES, '28', 3, 10),
      imageCount: 2,
    }),

    // Outerwear
    product({
      article: 'VLM-OW-001',
      photo: { url: 'https://unsplash.com/photos/nqBvAhRXWLc', author: 'Sebastian Schuster' },
      name: 'Пальто-тренч',
      description: 'Лёгкое пальто-тренч прямого кроя с отложным воротником.',
      kind: 'coat',
      brand: 'Vellmar',
      categorySlug: 'outerwear',
      price: 15990,
      discount: 20,
      rating: 4.9,
      colour: 'жёлтый',
      material: 'хлопок',
      season: 'демисезон',
      sizes: sizes(LETTER_SIZES, 'XS', 5, 11),
    }),
    product({
      article: 'OST-OW-002',
      photo: { url: 'https://unsplash.com/photos/pvCjWi5bATg', author: 'Lisa Anna' },
      name: 'Пальто оверсайз',
      description: 'Тёплое пальто оверсайз со спущенным плечом.',
      kind: 'coat',
      brand: 'Ostrova',
      categorySlug: 'outerwear',
      price: 13490,
      discount: 0,
      rating: 4.6,
      colour: 'серый',
      material: 'шерсть',
      season: 'зима',
      sizes: sizes(LETTER_SIZES, 'S', 4, 12),
      imageCount: 2,
    }),
    product({
      article: 'BRS-OW-003',
      photo: { url: 'https://unsplash.com/photos/_BDBEP0ePQc', author: 'kemal alkan' },
      name: 'Джинсовая куртка',
      description: 'Джинсовая куртка свободного кроя с нагрудными карманами.',
      kind: 'jacket',
      brand: 'Brisko',
      categorySlug: 'outerwear',
      price: 5990,
      discount: 10,
      rating: 4.5,
      colour: 'голубой',
      material: 'деним',
      season: 'демисезон',
      sizes: sizes(LETTER_SIZES, 'XS', 5, 13),
    }),
    product({
      article: 'TRV-OW-004',
      photo: { url: 'https://unsplash.com/photos/YehJ089r0uY', author: 'Anna Evans' },
      name: 'Кожаная куртка-косуха',
      description: 'Косуха из натуральной кожи на молнии.',
      kind: 'jacket',
      brand: 'Tervana',
      categorySlug: 'outerwear',
      price: 18990,
      discount: 30,
      rating: 4.7,
      colour: 'чёрный',
      material: 'кожа',
      season: 'демисезон',
      sizes: sizes(LETTER_SIZES, 'S', 4, 14),
    }),
    product({
      article: 'LMR-OW-005',
      photo: { url: 'https://unsplash.com/photos/gJtwWqMiyUw', author: 'Nikola Tasic' },
      name: 'Куртка из шерсти',
      description: 'Короткая куртка из плотной шерсти на пуговицах.',
      kind: 'jacket',
      brand: 'Lumora',
      categorySlug: 'outerwear',
      price: 7990,
      discount: 15,
      rating: 4.3,
      colour: 'коричневый',
      material: 'шерсть',
      season: 'демисезон',
      sizes: sizes(LETTER_SIZES, 'XS', 4, 15),
      imageCount: 2,
    }),

    // T-shirts
    product({
      article: 'BRS-TS-001',
      photo: { url: 'https://unsplash.com/photos/8ACmRoleM24', author: 'Avtar Singh' },
      name: 'Футболка базовая',
      description: 'Базовая футболка прямого кроя из плотного хлопка.',
      kind: 't-shirt',
      brand: 'Brisko',
      categorySlug: 't-shirts',
      price: 1290,
      discount: 0,
      rating: 4.6,
      colour: 'белый',
      material: 'хлопок',
      season: 'всесезон',
      sizes: sizes(LETTER_SIZES, 'XS', 5, 16),
    }),
    product({
      article: 'BRS-TS-002',
      photo: { url: 'https://unsplash.com/photos/Cs4GVbMqKGY', author: 'Ryan Hoffman' },
      name: 'Футболка оверсайз',
      description: 'Свободная футболка оверсайз со спущенным плечом.',
      kind: 't-shirt',
      brand: 'Brisko',
      categorySlug: 't-shirts',
      price: 1590,
      discount: 10,
      rating: 4.4,
      colour: 'чёрный',
      material: 'хлопок',
      season: 'всесезон',
      sizes: sizes(LETTER_SIZES, 'S', 4, 17),
      imageCount: 2,
    }),
    product({
      article: 'LMR-TS-003',
      photo: { url: 'https://unsplash.com/photos/oLSnyhU2BVU', author: 'tian dayong' },
      name: 'Футболка из льна',
      description: 'Лёгкая льняная футболка для жаркой погоды.',
      kind: 't-shirt',
      brand: 'Lumora',
      categorySlug: 't-shirts',
      price: 2190,
      discount: 20,
      rating: 4.2,
      colour: 'зелёный',
      material: 'лён',
      season: 'лето',
      sizes: sizes(LETTER_SIZES, 'XS', 4, 18),
    }),
    product({
      article: 'OST-TS-004',
      photo: { url: 'https://unsplash.com/photos/AqLIkOzWDAk', author: 'Cristofer Maximilian' },
      name: 'Футболка с круглым вырезом',
      description: 'Мягкая футболка с круглым вырезом.',
      kind: 't-shirt',
      brand: 'Ostrova',
      categorySlug: 't-shirts',
      price: 990,
      discount: 0,
      rating: 4.0,
      colour: 'голубой',
      material: 'хлопок',
      season: 'лето',
      sizes: sizes(LETTER_SIZES, 'S', 3, 19),
      imageCount: 2,
    }),
    product({
      article: 'TRV-TS-005',
      photo: { url: 'https://unsplash.com/photos/TvL5vIgwiwo', author: 'Mediamodifier' },
      name: 'Футболка приталенная',
      description: 'Приталенная футболка из эластичного хлопка.',
      kind: 't-shirt',
      brand: 'Tervana',
      categorySlug: 't-shirts',
      price: 1490,
      discount: 15,
      rating: 4.3,
      colour: 'белый',
      material: 'хлопок',
      season: 'лето',
      sizes: sizes(LETTER_SIZES, 'XS', 5, 20),
    }),

    // Hoodies
    product({
      article: 'BRS-HD-001',
      photo: { url: 'https://unsplash.com/photos/VXEca6MPGKk', author: 'Anastasiia Polishchuk' },
      name: 'Худи на флисе',
      description: 'Тёплое худи на флисе с капюшоном и карманом-кенгуру.',
      kind: 'hoodie',
      brand: 'Brisko',
      categorySlug: 'hoodies',
      price: 3990,
      discount: 0,
      rating: 4.7,
      colour: 'серый',
      material: 'хлопок',
      season: 'демисезон',
      sizes: sizes(LETTER_SIZES, 'XS', 5, 21),
    }),
    product({
      article: 'OST-HD-002',
      photo: { url: 'https://unsplash.com/photos/wIy8Eh4CFis', author: 'Just Capturing It' },
      name: 'Худи оверсайз',
      description: 'Объёмное худи оверсайз со спущенным плечом.',
      kind: 'hoodie',
      brand: 'Ostrova',
      categorySlug: 'hoodies',
      price: 4490,
      discount: 25,
      rating: 4.5,
      colour: 'оранжевый',
      material: 'хлопок',
      season: 'демисезон',
      sizes: sizes(LETTER_SIZES, 'S', 4, 22),
      imageCount: 2,
    }),
    product({
      article: 'TRV-HD-003',
      photo: { url: 'https://unsplash.com/photos/RYHvzYdeoCI', author: 'Kajetan Sumila' },
      name: 'Худи из флиса',
      description: 'Мягкое худи из флиса с капюшоном.',
      kind: 'hoodie',
      brand: 'Tervana',
      categorySlug: 'hoodies',
      price: 4290,
      discount: 10,
      rating: 4.2,
      colour: 'зелёный',
      material: 'полиэстер',
      season: 'демисезон',
      sizes: sizes(LETTER_SIZES, 'XS', 4, 23),
    }),
    product({
      article: 'LMR-HD-004',
      photo: { url: 'https://unsplash.com/photos/kJXGTOY1wLQ', author: 'Mediamodifier' },
      name: 'Укороченное худи',
      description: 'Укороченное худи из мягкого трикотажа.',
      kind: 'hoodie',
      brand: 'Lumora',
      categorySlug: 'hoodies',
      price: 3590,
      discount: 0,
      rating: 4.1,
      colour: 'белый',
      material: 'хлопок',
      season: 'всесезон',
      sizes: sizes(LETTER_SIZES, 'XS', 3, 24),
      imageCount: 2,
    }),
    product({
      article: 'VLM-HD-005',
      photo: { url: 'https://unsplash.com/photos/5KsOC5wQAL8', author: 'Andres Jasso' },
      name: 'Худи из шерсти',
      description: 'Худи из смесовой шерсти с капюшоном.',
      kind: 'hoodie',
      brand: 'Vellmar',
      categorySlug: 'hoodies',
      price: 6990,
      discount: 20,
      rating: 4.6,
      colour: 'синий',
      material: 'шерсть',
      season: 'зима',
      sizes: sizes(LETTER_SIZES, 'S', 4, 25),
    }),

    // Shoes
    product({
      article: 'BRS-SH-001',
      photo: { url: 'https://unsplash.com/photos/ZiBh2yOxB5Q', author: 'mojtaba mosayebzadeh' },
      name: 'Кеды низкие',
      description: 'Низкие кожаные кеды на плоской подошве.',
      kind: 'sneakers',
      brand: 'Brisko',
      categorySlug: 'shoes',
      price: 3490,
      discount: 0,
      rating: 4.5,
      colour: 'белый',
      material: 'кожа',
      season: 'лето',
      sizes: sizes(SHOE_SIZES, '37', 5, 26),
    }),
    product({
      article: 'TRV-SH-002',
      photo: { url: 'https://unsplash.com/photos/JavdKoyGF28', author: 'Antonino Visalli' },
      name: 'Кеды из канваса',
      description: 'Низкие кеды из плотного канваса на шнуровке.',
      kind: 'sneakers',
      brand: 'Tervana',
      categorySlug: 'shoes',
      price: 7990,
      discount: 15,
      rating: 4.8,
      colour: 'синий',
      material: 'хлопок',
      season: 'лето',
      sizes: sizes(SHOE_SIZES, '39', 5, 27),
    }),
    product({
      article: 'LMR-SH-003',
      photo: { url: 'https://unsplash.com/photos/t4g1gctAaKk', author: 'Mojtaba Fahiminia' },
      name: 'Кроссовки кожаные',
      description: 'Кожаные кроссовки на толстой подошве.',
      kind: 'sneakers',
      brand: 'Lumora',
      categorySlug: 'shoes',
      price: 8990,
      discount: 30,
      rating: 4.4,
      colour: 'бежевый',
      material: 'кожа',
      season: 'демисезон',
      sizes: sizes(SHOE_SIZES, '37', 4, 28),
      imageCount: 2,
    }),
    product({
      article: 'VLM-SH-004',
      photo: { url: 'https://unsplash.com/photos/_D7x0SJjiSs', author: 'Jia Ye' },
      name: 'Ботинки челси',
      description: 'Кожаные ботинки челси с эластичными вставками.',
      kind: 'boots',
      brand: 'Vellmar',
      categorySlug: 'shoes',
      price: 11990,
      discount: 10,
      rating: 4.7,
      colour: 'чёрный',
      material: 'кожа',
      season: 'демисезон',
      sizes: sizes(SHOE_SIZES, '37', 5, 29),
    }),
    product({
      article: 'OST-SH-005',
      photo: { url: 'https://unsplash.com/photos/o1P_ylA6t3k', author: 'roberto saborizado' },
      name: 'Ботинки челси с тиснением',
      description: 'Ботинки челси из гладкой кожи с тиснением и эластичными вставками.',
      kind: 'boots',
      brand: 'Ostrova',
      categorySlug: 'shoes',
      price: 9490,
      discount: 0,
      rating: 4.3,
      colour: 'коричневый',
      material: 'кожа',
      season: 'демисезон',
      sizes: sizes(SHOE_SIZES, '38', 5, 30),
      imageCount: 2,
    }),
  ],
};
