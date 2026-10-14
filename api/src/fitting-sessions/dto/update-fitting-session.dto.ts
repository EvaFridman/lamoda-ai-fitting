import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateFittingSessionDto } from './create-fitting-session.dto.js';

// Partial (spec 0004 E4); a session stays with its user, so `userId` is 400 here
// (forbidNonWhitelisted). `null` clears `title` and is refused in `isActive` (E48).
export class UpdateFittingSessionDto extends PartialType(
  OmitType(CreateFittingSessionDto, ['userId'] as const),
  { skipNullProperties: false },
) {}
