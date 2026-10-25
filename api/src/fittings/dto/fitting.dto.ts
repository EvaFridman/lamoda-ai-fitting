import { ApiProperty } from '@nestjs/swagger';

import {
  FittingFailure,
  FittingKind,
  GenerationStatus,
  OutfitSlot,
} from '../../generated/prisma/enums.js';

// Where a fitting is, for the waiting screen (A27, A70): `queued` until the worker takes it,
// `generating` while it runs, `done` once it ended either way.
export const FITTING_STAGES = ['queued', 'generating', 'done'] as const;
export type FittingStage = (typeof FITTING_STAGES)[number];

// One item of a fitting as the catalog has it now, with the colour tried on.
export class FittingItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: "The brand's name." })
  brand: string;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description: "The product's first image; null when it has none.",
  })
  imageUrl: string | null;

  @ApiProperty({ example: 4990 })
  price: number;

  @ApiProperty({ example: 3992, description: 'The price after the discount.' })
  finalPrice: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  attributeValueId: string | null;

  @ApiProperty({ type: String, nullable: true, description: "The colour's name." })
  colour: string | null;

  @ApiProperty({
    enum: OutfitSlot,
    enumName: 'OutfitSlot',
    nullable: true,
    description:
      "The item's slot in the look when it was tried on; null on the closed route's rows.",
  })
  slot: OutfitSlot | null;
}

// A fitting of the signed-in user (spec 0019 plan §5): no storage key, a signed link instead (spec
// 0011 M9); its one text is the user's own wishes (A92.1).
export class FittingDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: FittingKind, enumName: 'FittingKind' })
  kind: FittingKind;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The result this one regenerates; null for a try-on, or once that one is deleted.',
  })
  parentId: string | null;

  @ApiProperty({ enum: GenerationStatus, enumName: 'GenerationStatus' })
  status: GenerationStatus;

  @ApiProperty({ enum: FITTING_STAGES })
  stage: FittingStage;

  @ApiProperty({ enum: FittingFailure, enumName: 'FittingFailure', nullable: true })
  failureCode: FittingFailure | null;

  @ApiProperty({
    description:
      "Whether it spent a try-on of the month's limit: false for a free regeneration and for one that failed.",
  })
  countsAgainstLimit: boolean;

  @ApiProperty({
    description:
      "Whether this result's next regeneration is free (A6, A70): a completed try-on's result whose free one is unused and whose photo is still there; a regeneration's never is.",
  })
  regenerationFree: boolean;

  @ApiProperty({ example: 'gpt-image-2', description: "The image model's short name." })
  model: string;

  @ApiProperty({ type: [FittingItemResponseDto] })
  items: FittingItemResponseDto[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The photo tried on; null once it is deleted (the result stays).',
  })
  photoId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The wishes it was tried on with (a regeneration has its parent's); null when none. A colour change sends them again (A92.1).",
  })
  promptText: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    nullable: true,
    description:
      "Reads the result for S3_SIGNED_URL_TTL_SECONDS (15 minutes); null with no result or when the key is outside the owner's folder.",
  })
  resultUrl: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'When the model call was sent; null before.',
  })
  startedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  finishedAt: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 25,
    description:
      "The expected seconds from the start to the result (A27): the median of the user's last completed fittings, 25 before any; null once it ended.",
  })
  estimatedSeconds: number | null;
}

// The answer of a start or a regeneration: `repeated` when it opened an earlier result instead of
// a new one (A7), which spent nothing.
export class StartedFittingDto extends FittingDto {
  @ApiProperty({
    description: 'An earlier completed result of the same photo, items and text, opened for free.',
  })
  repeated: boolean;
}
