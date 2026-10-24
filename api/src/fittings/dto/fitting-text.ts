// The fitting's texts (spec 0019 A16, A70): the wishes of a try-on and a regeneration's comment.
export const WISHES_MAX_LENGTH = 200;
export const COMMENT_MAX_LENGTH = 300;

// Trimmed as the columns' CHECK wants (String.prototype.trim, A16); blank is no text. Anything
// but a string stays as sent and fails the rules after it.
export function trimText({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  return text === '' ? undefined : text;
}
