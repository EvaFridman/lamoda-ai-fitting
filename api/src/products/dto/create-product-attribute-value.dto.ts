import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Links a value of any attribute to the product from the path (spec 0004 E44). A missing value is
// 400 RELATED_NOT_FOUND, a value already linked 409 ALREADY_EXISTS.
export class CreateProductAttributeValueDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  attributeValueId: string;
}
