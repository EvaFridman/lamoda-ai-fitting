import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { IsOmittable, IsTrimmedText, NAME_MAX_LENGTH } from '../../common/validation/rules.js';

// `isActive` has no initializer: PartialType would copy it into the update DTO, where a field left
// out keeps its value. The service treats a missing one as true (spec 0004 E48). No `userId`: the
// session is the signed-in user's, and one in the body is 400 as any unknown field (spec 0013 plan
// §6).
export class CreateFittingSessionDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NAME_MAX_LENGTH,
    example: 'Вечернее платье',
  })
  @IsOptional()
  @IsTrimmedText(NAME_MAX_LENGTH)
  title?: string | null;

  @ApiPropertyOptional({
    description:
      "True when left out on create. Making a session active archives the user's active one.",
  })
  @IsOmittable()
  @IsBoolean()
  isActive?: boolean;
}
