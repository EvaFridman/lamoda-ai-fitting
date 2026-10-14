import { ApiProperty } from '@nestjs/swagger';

import { GenerationStatus } from '../../generated/prisma/enums.js';

// A generation's own columns and its product ids sorted by id (spec 0004 E7, E51). Image keys have
// no url: personal photos are not public catalog media.
export class AiGenerationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  sessionId: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  productIds: string[];

  @ApiProperty({ example: 'users/photo.jpg' })
  userImageKey: string;

  @ApiProperty({ type: String, nullable: true, example: 'generations/result.jpg' })
  resultImageKey: string | null;

  @ApiProperty({ enum: GenerationStatus, enumName: 'GenerationStatus' })
  status: GenerationStatus;

  @ApiProperty({ example: 'openai' })
  aiProvider: string;

  @ApiProperty({ example: 'gpt-image-1' })
  aiModel: string;

  @ApiProperty({ type: String, nullable: true, example: 'PROVIDER_TIMEOUT' })
  errorMessage: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
