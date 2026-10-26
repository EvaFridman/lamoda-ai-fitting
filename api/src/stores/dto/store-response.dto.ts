import { ApiProperty } from '@nestjs/swagger';

import { StoreType } from '../../generated/prisma/enums.js';

// A Lamoda Sport store (spec 0022 plan §2.3): no store code, position or dates.
export class StoreResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ТЦ Охотный ряд Urban' })
  name: string;

  @ApiProperty({ enum: StoreType, enumName: 'StoreType' })
  type: StoreType;

  @ApiProperty({ example: 'г. Москва' })
  city: string;

  @ApiProperty()
  street: string;

  @ApiProperty()
  house: string;

  @ApiProperty({ description: 'The mall the store is in.' })
  mall: string;

  @ApiProperty({ minimum: -90, maximum: 90 })
  latitude: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  longitude: number;

  @ApiProperty({ type: [String], description: 'Empty when no station is near (spec 0022 X20).' })
  metroStations: string[];

  @ApiProperty({ description: "Lamoda's text of the opening hours." })
  workTime: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [String], description: "Lamoda's text of each phone; may be empty." })
  phones: string[];
}
