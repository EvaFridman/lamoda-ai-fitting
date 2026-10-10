import { PartialType } from '@nestjs/swagger';

import { CreateUserDto } from './create-user.dto.js';

// Partial (spec 0004 E4); null is refused in `phone`, `email` and `firstName` and clears the other
// fields (E47).
export class UpdateUserDto extends PartialType(CreateUserDto, { skipNullProperties: false }) {}
