import { ValidationPipe, type ValidationError as ClassValidatorError } from '@nestjs/common';

import { type ErrorDetail, ValidationError } from '../errors/app.exception.js';

// The global pipe (main.ts): DTOs checked by class-validator, unknown fields refused, values
// converted to their types. A failure answers VALIDATION_FAILED with one detail per broken rule
// (spec 0004 E21, AC14).
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationError(toDetails(errors)),
  });
}

// Nested DTOs and arrays come as a tree; each leaf becomes a detail whose `field` is the dotted
// path (`sizes.0.stock`) and whose `code` is the rule in upper snake case (`isNotEmpty` →
// `IS_NOT_EMPTY`, `whitelistValidation` → `WHITELIST_VALIDATION` for an unknown field).
export function toDetails(errors: ClassValidatorError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const own = Object.entries(error.constraints ?? {}).map(([rule, message]) => ({
      field,
      code: toUpperSnake(rule),
      message,
    }));
    return [...own, ...toDetails(error.children ?? [], field)];
  });
}

function toUpperSnake(name: string): string {
  return name.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}
