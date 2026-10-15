// Contract check of web's response schemas against the api's OpenAPI snapshot (spec 0007 H12,
// H18). Used only by tests (`*.contract.test.ts`): it reads a file from disk.
export { contractDiff, type ContractCheck, type OpenApiDocument } from './contract-diff';
export { openApiDocument } from './openapi-document';
