import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateAiGenerationDto } from './create-ai-generation.dto.js';

// Partial (spec 0004 E4); a generation stays with its session, so `sessionId` is 400 here
// (forbidNonWhitelisted). `null` clears `resultImageKey` and `errorMessage` and is refused in the
// other fields, `productIds` included (E53, E54).
export class UpdateAiGenerationDto extends PartialType(
  OmitType(CreateAiGenerationDto, ['sessionId'] as const),
  { skipNullProperties: false },
) {}
