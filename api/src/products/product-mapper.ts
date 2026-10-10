import { toMediaUrl } from '../common/media/media-url.js';
import { decimalToNumber } from '../common/price/decimal.js';
import { finalPrice } from '../common/price/final-price.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ProductAttributeDto,
  ProductDetailDto,
  ProductListItemDto,
} from './dto/product-response.dto.js';

// The first image and the order of `images[]`: `sortOrder`, then id (spec 0004 E43).
const IMAGE_ORDER: Prisma.ProductImageOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { id: 'asc' },
];

export const LIST_ITEM_INCLUDE = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { imageKey: true }, orderBy: IMAGE_ORDER, take: 1 },
} satisfies Prisma.ProductInclude;

// Sizes in the order they were added; attribute links by attribute name, then value (E43). Names
// are unique, and so are values within an attribute, so the order is fixed.
export const DETAIL_INCLUDE = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { id: true, imageKey: true, sortOrder: true }, orderBy: IMAGE_ORDER },
  variations: { select: { id: true, size: true, stock: true }, orderBy: { id: 'asc' } },
  attributeValues: {
    select: {
      attributeValue: {
        select: { id: true, value: true, attribute: { select: { id: true, name: true } } },
      },
    },
    orderBy: [
      { attributeValue: { attribute: { name: 'asc' } } },
      { attributeValue: { value: 'asc' } },
    ],
  },
} satisfies Prisma.ProductInclude;

type ListItemRow = Prisma.ProductGetPayload<{ include: typeof LIST_ITEM_INCLUDE }>;
type DetailRow = Prisma.ProductGetPayload<{ include: typeof DETAIL_INCLUDE }>;

// The detail starts from the list item; `image` is the first of `images`.
export function toListItem(row: ListItemRow | DetailRow, mediaBaseUrl: string): ProductListItemDto {
  const first = row.images[0];
  return {
    id: row.id,
    article: row.article,
    name: row.name,
    brand: row.brand,
    category: row.category,
    image: first === undefined ? null : { url: toMediaUrl(mediaBaseUrl, first.imageKey) },
    price: decimalToNumber(row.price),
    discount: row.discount,
    finalPrice: finalPrice(row.price, row.discount),
    rating: decimalToNumber(row.rating),
    createdAt: row.createdAt,
  };
}

export function toDetail(row: DetailRow, mediaBaseUrl: string): ProductDetailDto {
  return {
    ...toListItem(row, mediaBaseUrl),
    description: row.description,
    images: row.images.map((image) => ({
      id: image.id,
      url: toMediaUrl(mediaBaseUrl, image.imageKey),
      sortOrder: image.sortOrder,
    })),
    variations: row.variations,
    attributes: groupByAttribute(row.attributeValues),
  };
}

// Links come sorted by attribute name, then value, so a group follows the previous one.
function groupByAttribute(links: DetailRow['attributeValues']): ProductAttributeDto[] {
  const groups = new Map<string, ProductAttributeDto>();
  for (const { attributeValue } of links) {
    const { attribute, id, value } = attributeValue;
    let group = groups.get(attribute.id);
    if (group === undefined) {
      group = { attribute, values: [] };
      groups.set(attribute.id, group);
    }
    group.values.push({ id, value });
  }
  return [...groups.values()];
}
