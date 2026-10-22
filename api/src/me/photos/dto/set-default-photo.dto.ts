import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';

// The body of PATCH /me/photos/:id (spec 0019 plan §5): the one change a photo takes. Only `true`:
// the default is moved to another photo, never cleared, so the try-on always has one to preselect
// while a saved photo exists (A31).
export class SetDefaultPhotoDto {
  @ApiProperty({ type: Boolean, enum: [true], description: 'Makes this photo the default.' })
  @IsBoolean()
  @IsIn([true])
  isDefault: true;
}
