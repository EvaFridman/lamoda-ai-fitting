import { Module } from '@nestjs/common';

import { AttributeValuesController } from './attribute-values.controller.js';
import { AttributeValuesService } from './attribute-values.service.js';
import { AttributesController } from './attributes.controller.js';
import { AttributesService } from './attributes.service.js';

// Attributes and their values (spec 0004 E3, E42).
@Module({
  controllers: [AttributesController, AttributeValuesController],
  providers: [AttributesService, AttributeValuesService],
})
export class AttributesModule {}
