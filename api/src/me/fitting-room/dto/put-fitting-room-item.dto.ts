import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

// The body of PUT /me/fitting-room/:slot (spec 0019 plan §5). The product's category and its slot
// (HAS_SLOT, MATCHES_SLOT) and the colour's product (RELATED_NOT_FOUND) are checked by the service,
// which reads the catalog.
export class PutFittingRoomItemDto {
  @ApiProperty({ format: 'uuid', description: "A product whose category's slot is the path's." })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "The colour: one of the product's attribute values. Left out, none is chosen.",
  })
  // Left out only: `null` is refused (IS_UUID) as `PATCH /me`'s gender is, since IsOptional would
  // let it through to the colour's query.
  @ValidateIf((_dto, value) => value !== undefined)
  @IsUUID()
  attributeValueId?: string;
}
