import { ApiProperty } from '@nestjs/swagger';

// The month's try-ons of the signed-in user (spec 0019 A20, A26): `GET /me/fitting-quota`.
export class FittingQuotaDto {
  @ApiProperty({ example: 10, description: 'FITTING_MONTHLY_LIMIT.' })
  limit: number;

  @ApiProperty({ example: 3 })
  used: number;

  @ApiProperty({ example: 7 })
  left: number;

  @ApiProperty({
    description: 'When the limit renews: the first of the next month, midnight in Moscow.',
  })
  renewsAt: Date;

  @ApiProperty({
    example: 2,
    description:
      'Completed fittings the user has not opened yet (POST /fittings/:id/seen, POST /fittings/seen).',
  })
  unseen: number;
}
