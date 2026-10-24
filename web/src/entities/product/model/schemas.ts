import { z } from 'zod';

import { cursorPaginatedSchema, paginatedSchema } from '@/shared/api';
import { colorHexSchema } from '@/shared/lib';

// The brand and category a product embeds: their own DTOs, not the brand and category entities'.

// ProductBrandDto.
export const productBrandSchema = z.object({ id: z.uuid(), name: z.string() });

// ProductCategoryDto.
export const productCategorySchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string() });

// ProductCoverDto.
export const productCoverSchema = z.object({ url: z.url() });

// ProductListItemDto.
export const productListItemSchema = z.object({
  id: z.uuid(),
  article: z.string(),
  name: z.string(),
  brand: productBrandSchema,
  category: productCategorySchema,
  image: productCoverSchema.nullable(),
  price: z.number(),
  discount: z.number(),
  finalPrice: z.number(),
  rating: z.number().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// ProductImageDto.
export const productImageSchema = z.object({ id: z.uuid(), url: z.url(), sortOrder: z.number() });

// ProductVariationDto.
export const productVariationSchema = z.object({
  id: z.uuid(),
  size: z.string(),
  stock: z.number(),
});

// ProductAttributeRefDto.
export const productAttributeRefSchema = z.object({ id: z.uuid(), name: z.string() });

// ProductAttributeValueRefDto.
export const productAttributeValueRefSchema = z.object({
  id: z.uuid(),
  value: z.string(),
  // The swatch colour of a colour attribute's value (spec 0009), null for any other.
  colorHex: colorHexSchema.nullable(),
});

// ProductAttributeDto.
export const productAttributeSchema = z.object({
  attribute: productAttributeRefSchema,
  values: z.array(productAttributeValueRefSchema),
});

// ProductDetailDto: the list item plus the description, images, sizes and attribute values.
export const productDetailSchema = productListItemSchema.extend({
  description: z.string().nullable(),
  images: z.array(productImageSchema),
  variations: z.array(productVariationSchema),
  attributes: z.array(productAttributeSchema),
});

// FacetPriceDto.
export const facetPriceSchema = z.object({ min: z.number(), max: z.number() });

// FacetCategoryDto.
export const facetCategorySchema = z.object({ id: z.uuid(), name: z.string(), count: z.number() });

// FacetBrandDto.
export const facetBrandSchema = z.object({ id: z.uuid(), name: z.string(), count: z.number() });

// FacetSizeDto.
export const facetSizeSchema = z.object({ size: z.string(), count: z.number() });

// FacetAttributeValueDto.
export const facetAttributeValueSchema = z.object({
  id: z.uuid(),
  value: z.string(),
  colorHex: colorHexSchema.nullable(),
  count: z.number(),
});

// FacetAttributeDto.
export const facetAttributeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  values: z.array(facetAttributeValueSchema),
});

// ProductFacetsDto: the filter counts.
export const productFacetsSchema = z.object({
  total: z.number(),
  discounted: z.number(),
  price: facetPriceSchema.nullable(),
  categories: z.array(facetCategorySchema),
  brands: z.array(facetBrandSchema),
  sizes: z.array(facetSizeSchema),
  attributes: z.array(facetAttributeSchema),
});

// The parts of a product on their own routes (/products/:id/images, …).

// ProductImageResponseDto.
export const productImageRecordSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  imageKey: z.string(),
  url: z.url(),
  sortOrder: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// ProductVariationResponseDto.
export const productVariationRecordSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  size: z.string(),
  stock: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// ProductAttributeValueResponseDto.
export const productAttributeValueRecordSchema = z.object({
  productId: z.uuid(),
  attributeValueId: z.uuid(),
  attribute: productAttributeRefSchema,
  value: productAttributeValueRefSchema,
  createdAt: z.iso.datetime(),
});

// GET /products.
export const productListSchema = cursorPaginatedSchema(productListItemSchema);

// GET /products/:id/related: «С этим товаром выбирают» (spec 0019 A36).
export const relatedProductsSchema = z.array(productListItemSchema);
// GET /products/:id/images.
export const productImageListSchema = paginatedSchema(productImageRecordSchema);
// GET /products/:id/variations.
export const productVariationListSchema = paginatedSchema(productVariationRecordSchema);
// GET /products/:id/attribute-values.
export const productAttributeValueListSchema = paginatedSchema(productAttributeValueRecordSchema);

export type ProductListItem = z.infer<typeof productListItemSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type ProductFacets = z.infer<typeof productFacetsSchema>;
export type FacetPrice = z.infer<typeof facetPriceSchema>;
export type FacetBrand = z.infer<typeof facetBrandSchema>;
export type FacetSize = z.infer<typeof facetSizeSchema>;
export type FacetAttribute = z.infer<typeof facetAttributeSchema>;
export type ProductImageRecord = z.infer<typeof productImageRecordSchema>;
export type ProductVariationRecord = z.infer<typeof productVariationRecordSchema>;
export type ProductAttributeValueRecord = z.infer<typeof productAttributeValueRecordSchema>;
export type ProductList = z.infer<typeof productListSchema>;
export type RelatedProducts = z.infer<typeof relatedProductsSchema>;
export type ProductImageList = z.infer<typeof productImageListSchema>;
export type ProductVariationList = z.infer<typeof productVariationListSchema>;
export type ProductAttributeValueList = z.infer<typeof productAttributeValueListSchema>;
