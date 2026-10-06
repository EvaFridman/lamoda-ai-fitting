// Shared by the HTTP endpoint and the Temporal activity. A plain module with no Nest or Node imports,
// so workflow and activity code can use it too.
export const GREETING = 'Hello, world!';
