// The message of a refusal's detail (`PHOTO_REFUSED`, `PROMPT_REFUSED`): the field and the reason
// in its code form, `moderation:<category>` too (spec 0019 A55, spec 0023 plan §3.5). web picks
// its text by the reason, so the shape is pinned by api/refusal-messages.json, which
// test/refusal-messages.e2e-spec.ts keeps and web's contract test reads.
export function refusalMessage(field: string, reason: string): string {
  return `${field} was refused: ${reason}`;
}
