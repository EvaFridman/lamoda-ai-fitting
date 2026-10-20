import { getMetadataStorage, type MetadataStorage, ValidationTypes } from 'class-validator';
import { describe, expect, it } from 'vitest';

// Imported for its side effect: a DTO registers its rules only once its module is loaded.
import '../src/app.module.js';
import { toUpperSnake } from '../src/common/validation/validation-pipe.js';

// Every `details` code the DTOs' rules can answer (spec 0017 U15, plan §3), as a committed
// snapshot: web's error-text.contract.test.ts fails on a code with no text in DETAIL_TEXTS. A new
// rule fails this test until `npm --prefix api test -- -u` rewrites api/validation-codes.json,
// committed with the change. Codes that come from elsewhere (an unknown field, a database rule,
// a path id, the owner check, a cut list) are not here; web's texts cover them by hand.

// The package's index does not export this type.
type ValidationMetadata = ReturnType<MetadataStorage['getTargetValidationMetadatas']>[number];

// The rule name the pipe turns into a code: a custom rule's (`ValidateBy`, the built-in
// decorators too) is its constraint's name; a condition (`IsOptional`, `ValidateIf`) is no rule.
function ruleName(metadata: ValidationMetadata): string | undefined {
  switch (metadata.type) {
    case ValidationTypes.CONDITIONAL_VALIDATION:
      return undefined;
    case ValidationTypes.CUSTOM_VALIDATION: {
      const [constraint] = getMetadataStorage().getTargetValidatorConstraints(
        metadata.constraintCls,
      );
      if (constraint?.name === undefined) {
        throw new Error(`a rule of ${metadata.propertyName} has no constraint name`);
      }
      return constraint.name;
    }
    default:
      return metadata.type;
  }
}

function validationCodes(): string[] {
  // The storage keeps its rules in a private map from each class to its rules. It is global, so
  // it holds the app's DTOs only while Vitest isolates test files (its default) and this file
  // declares no class of its own.
  const storage = getMetadataStorage() as unknown as {
    validationMetadatas: Map<unknown, ValidationMetadata[]>;
  };
  const names = [...storage.validationMetadatas.values()].flat().map(ruleName);
  return [...new Set(names.filter((name) => name !== undefined).map(toUpperSnake))].sort();
}

describe('validation codes', () => {
  const codes = validationCodes();

  // A collector that stopped finding rules would shrink the snapshot quietly: a built-in rule and
  // the project's own rules (rules.ts) must stay.
  it.each(['IS_STRING', 'MAX_DECIMAL_PLACES', 'IS_PERSON_NAME', 'IS_DATE_OF_BIRTH'])(
    'include %s',
    (code) => {
      expect(codes).toContain(code);
    },
  );

  it('match api/validation-codes.json', async () => {
    await expect(`${JSON.stringify(codes, null, 2)}\n`).toMatchFileSnapshot(
      '../validation-codes.json',
    );
  });
});
