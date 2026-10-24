import { ApiProperty } from '@nestjs/swagger';

// A fitting photo of the signed-in user (spec 0019 plan §5): no key, a signed link instead (spec
// 0011 M9).
export class UserPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description:
      "Reads the photo for S3_SIGNED_URL_TTL_SECONDS (15 minutes); null when the stored key is outside the owner's folder.",
  })
  url: string | null;

  @ApiProperty({ description: 'The photo preselected in the try-on; one per user.' })
  isDefault: boolean;

  @ApiProperty({
    description:
      'A one-time photo (uploaded with save=false): not among the saved ones, deleted when the try-on closes or an hour after its last fitting (unused, after its upload).',
  })
  transient: boolean;

  @ApiProperty({ description: 'Of the stored WebP, at most 2048 px.', example: 1536 })
  width: number;

  @ApiProperty({ example: 2048 })
  height: number;

  @ApiProperty()
  createdAt: Date;
}
