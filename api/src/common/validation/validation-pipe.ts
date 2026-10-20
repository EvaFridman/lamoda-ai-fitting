import { ValidationPipe, type ValidationError as ClassValidatorError } from '@nestjs/common';

import { type ErrorDetail, ValidationError } from '../errors/app.exception.js';

// The global pipe (server.ts): DTOs checked by class-validator, unknown fields refused, values
// converted to their types. A failure answers VALIDATION_FAILED with one detail per broken rule
// (spec 0004 E21, AC14); a value of the wrong type gets only that detail (E61).
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationError(capDetails(toDetails(errors))),
  });
}

// A body of many unknown fields would answer about twelve times its size in details, so only the
// first MAX_DETAILS stay and one TOO_MANY_ERRORS entry counts the rest (spec 0006 F14).
export const MAX_DETAILS = 50;

export function capDetails(details: ErrorDetail[]): ErrorDetail[] {
  if (details.length <= MAX_DETAILS) return details;
  const rest = details.length - MAX_DETAILS;
  return [
    ...details.slice(0, MAX_DETAILS),
    { field: '', code: 'TOO_MANY_ERRORS', message: `${rest} more errors` },
  ];
}

// Nested DTOs and arrays come as a tree; each leaf becomes a detail whose `field` is the dotted
// path (`sizes.0.stock`) and whose `code` is the rule in upper snake case (`isNotEmpty` →
// `IS_NOT_EMPTY`, `whitelistValidation` → `WHITELIST_VALIDATION` for an unknown field).
export function toDetails(errors: ClassValidatorError[], parent = ''): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const own = ownRules(error.constraints ?? {}).map(([rule, message]) => ({
      field: clip(field, MAX_FIELD_LENGTH),
      code: toUpperSnake(rule),
      message: clip(message, MAX_MESSAGE_LENGTH),
    }));
    return [...own, ...toDetails(error.children ?? [], field)];
  });
}

// class-validator runs every rule of a field, so `abc` for a price also failed its decimal places,
// minimum and maximum, which say nothing about a value that is not a number (E61). A missing field
// fails its type too. With `each`, the rules are the field's, so one item of the wrong type hides
// the other items' rules.
const TYPE_RULES = new Set(['isNumber', 'isInt', 'isString', 'isBoolean', 'isArray']);

function ownRules(constraints: Record<string, string>): [string, string][] {
  const rules = Object.entries(constraints);
  const type = rules.filter(([rule]) => TYPE_RULES.has(rule));
  return type.length > 0 ? type : rules;
}

// An unknown field's name is echoed in `field` and `message`, so a body of one long key would answer
// a few times its size: both are cut, the cut ending in `…` (spec 0006 F25). Counted in code
// points, so a cut never splits a character.
export const MAX_FIELD_LENGTH = 100;
export const MAX_MESSAGE_LENGTH = 200;

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

// Exported for test/validation-codes.e2e-spec.ts, which turns the DTOs' rule names into codes.
export function toUpperSnake(name: string): string {
  return name.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}
