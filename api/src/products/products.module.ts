import { Module } from '@nestjs/common';

import { ProductAttributeValuesController } from './product-attribute-values.controller.js';
import { ProductAttributeValuesService } from './product-attribute-values.service.js';
import { ProductImagesController } from './product-images.controller.js';
import { ProductImagesService } from './product-images.service.js';
import { ProductVariationsController } from './product-variations.controller.js';
import { ProductVariationsService } from './product-variations.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

// Products and their parts: images, sizes, attribute links (spec 0004 E3, E43, E44).
@Module({
  controllers: [
    ProductsController,
    ProductImagesController,
    ProductVariationsController,
    ProductAttributeValuesController,
  ],
  providers: [
    ProductsService,
    ProductImagesService,
    ProductVariationsService,
    ProductAttributeValuesService,
  ],
})
export class ProductsModule {}
