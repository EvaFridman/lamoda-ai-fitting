// The one address OpenAI is called at (spec 0019 A4). In a file of its own so sentry.options.ts,
// which runs before Nest, can cut requests to it down to the method and this origin.
export const OPENAI_ORIGIN = 'https://api.openai.com';
