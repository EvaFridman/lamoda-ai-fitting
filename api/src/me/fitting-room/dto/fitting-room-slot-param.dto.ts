import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { OutfitSlot } from '../../../generated/prisma/enums.js';

// A slot in the path (spec 0019 A86): any of the five, `accessory` too, which no category has yet,
// so its PUT is always refused; anything else answers 400 VALIDATION_FAILED on `slot`.
export class FittingRoomSlotParamDto {
  @ApiProperty({ enum: OutfitSlot, enumName: 'OutfitSlot' })
  @IsEnum(OutfitSlot)
  slot: OutfitSlot;
}
