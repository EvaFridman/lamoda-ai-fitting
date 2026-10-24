import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { PRODUCT_SORTS } from './filters';
import {
  facetAttributeSchema,
  facetAttributeValueSchema,
  facetBrandSchema,
  facetCategorySchema,
  facetPriceSchema,
  facetSizeSchema,
  productAttributeRefSchema,
  productAttributeSchema,
  productAttributeValueListSchema,
  productAttributeValueRecordSchema,
  productAttributeValueRefSchema,
  productBrandSchema,
  productCategorySchema,
  productCoverSchema,
  productDetailSchema,
  productFacetsSchema,
  productImageListSchema,
  productImageRecordSchema,
  productImageSchema,
  productListItemSchema,
  productListSchema,
  productVariationListSchema,
  productVariationRecordSchema,
  productVariationSchema,
  relatedProductsSchema,
} from './schemas';

const checks: ContractCheck[] = [
  { name: 'productBrandSchema', schema: productBrandSchema, component: 'ProductBrandDto' },
  {
    name: 'productCategorySchema',
    schema: productCategorySchema,
    component: 'ProductCategoryDto',
  },
  { name: 'productCoverSchema', schema: productCoverSchema, component: 'ProductCoverDto' },
  {
    name: 'productListItemSchema',
    schema: productListItemSchema,
    component: 'ProductListItemDto',
  },
  { name: 'productImageSchema', schema: productImageSchema, component: 'ProductImageDto' },
  {
    name: 'productVariationSchema',
    schema: productVariationSchema,
    component: 'ProductVariationDto',
  },
  {
    name: 'productAttributeRefSchema',
    schema: productAttributeRefSchema,
    component: 'ProductAttributeRefDto',
  },
  {
    name: 'productAttributeValueRefSchema',
    schema: productAttributeValueRefSchema,
    component: 'ProductAttributeValueRefDto',
  },
  {
    name: 'productAttributeSchema',
    schema: productAttributeSchema,
    component: 'ProductAttributeDto',
  },
  { name: 'productDetailSchema', schema: productDetailSchema, component: 'ProductDetailDto' },
  { name: 'facetPriceSchema', schema: facetPriceSchema, component: 'FacetPriceDto' },
  { name: 'facetCategorySchema', schema: facetCategorySchema, component: 'FacetCategoryDto' },
  { name: 'facetBrandSchema', schema: facetBrandSchema, component: 'FacetBrandDto' },
  { name: 'facetSizeSchema', schema: facetSizeSchema, component: 'FacetSizeDto' },
  {
    name: 'facetAttributeValueSchema',
    schema: facetAttributeValueSchema,
    component: 'FacetAttributeValueDto',
  },
  { name: 'facetAttributeSchema', schema: facetAttributeSchema, component: 'FacetAttributeDto' },
  { name: 'productFacetsSchema', schema: productFacetsSchema, component: 'ProductFacetsDto' },
  {
    name: 'productImageRecordSchema',
    schema: productImageRecordSchema,
    component: 'ProductImageResponseDto',
  },
  {
    name: 'productVariationRecordSchema',
    schema: productVariationRecordSchema,
    component: 'ProductVariationResponseDto',
  },
  {
    name: 'productAttributeValueRecordSchema',
    schema: productAttributeValueRecordSchema,
    component: 'ProductAttributeValueResponseDto',
  },
  {
    name: 'productListSchema',
    schema: productListSchema,
    response: { method: 'get', path: '/products', status: '200' },
  },
  {
    name: 'productFacetsSchema (route)',
    schema: productFacetsSchema,
    response: { method: 'get', path: '/products/facets', status: '200' },
  },
  {
    name: 'productDetailSchema (route)',
    schema: productDetailSchema,
    response: { method: 'get', path: '/products/{id}', status: '200' },
  },
  {
    name: 'relatedProductsSchema',
    schema: relatedProductsSchema,
    response: { method: 'get', path: '/products/{id}/related', status: '200' },
  },
  {
    name: 'productImageListSchema',
    schema: productImageListSchema,
    response: { method: 'get', path: '/products/{id}/images', status: '200' },
  },
  {
    name: 'productVariationListSchema',
    schema: productVariationListSchema,
    response: { method: 'get', path: '/products/{id}/variations', status: '200' },
  },
  {
    name: 'productAttributeValueListSchema',
    schema: productAttributeValueListSchema,
    response: { method: 'get', path: '/products/{id}/attribute-values', status: '200' },
  },
];

describe('product schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});

// The orders web sends are a copy too (H20): GET /products `sort` in the document.
interface Operation {
  parameters?: { name: string; in: string; schema?: { enum?: unknown[] } }[];
}

describe('product sorts match the api', () => {
  it('PRODUCT_SORTS ↔ GET /products sort', () => {
    const paths = openApiDocument().paths as Record<string, { get?: Operation }> | undefined;
    const sort = paths?.['/products']?.get?.parameters?.find(
      (parameter) => parameter.in === 'query' && parameter.name === 'sort',
    );
    expect([...PRODUCT_SORTS].sort()).toEqual([...(sort?.schema?.enum ?? [])].sort());
  });
});
