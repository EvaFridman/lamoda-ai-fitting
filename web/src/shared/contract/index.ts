// Contract check of web's response schemas against the api's OpenAPI snapshot (spec 0007 H12,
// H18), of web's detail texts against its validation codes (spec 0017 U15), and of its refusal
// parsers against the api's refusal messages (spec 0023 plan §3.5). Used only by tests
// (`*.contract.test.ts`): it reads files from disk.
export { contractDiff, type ContractCheck, type OpenApiDocument } from './contract-diff';
export { openApiDocument } from './openapi-document';
export { type RefusalMessage, type RefusalMessages, refusalMessages } from './refusal-messages';
export { validationCodes } from './validation-codes';
