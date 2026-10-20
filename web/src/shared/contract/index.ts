// Contract check of web's response schemas against the api's OpenAPI snapshot (spec 0007 H12,
// H18), and of web's detail texts against its validation codes (spec 0017 U15). Used only by tests
// (`*.contract.test.ts`): it reads files from disk.
export { contractDiff, type ContractCheck, type OpenApiDocument } from './contract-diff';
export { openApiDocument } from './openapi-document';
export { validationCodes } from './validation-codes';
