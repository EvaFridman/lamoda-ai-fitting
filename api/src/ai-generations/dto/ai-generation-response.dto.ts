import { ApiProperty } from '@nestjs/swagger';

import { GenerationStatus } from '../../generated/prisma/enums.js';
import { RESULT_IMAGE_KEY_EXAMPLE, USER_IMAGE_KEY_EXAMPLE } from './create-ai-generation.dto.js';

// A generation's own columns, its product ids sorted by id (spec 0004 E7, E51) and signed links to
// its images (spec 0011 M9).
export class AiGenerationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  sessionId: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  productIds: string[];

  // `null` for a fitting, which references its photo instead (spec 0019 A24).
  @ApiProperty({ type: String, nullable: true, example: USER_IMAGE_KEY_EXAMPLE })
  userImageKey: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description:
      "Reads the image for S3_SIGNED_URL_TTL_SECONDS (15 minutes); null when the key is outside the owner's folder.",
  })
  userImageUrl: string | null;

  @ApiProperty({ type: String, nullable: true, example: RESULT_IMAGE_KEY_EXAMPLE })
  resultImageKey: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description:
      "Reads the result for S3_SIGNED_URL_TTL_SECONDS (15 minutes); null with no result or when the key is outside the owner's folder.",
  })
  resultImageUrl: string | null;

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
