import { describe, expect, it } from 'vitest';

import { moderationRefusal, moderationStage, safetyCategory } from './safety-category.js';

describe('safetyCategory', () => {
  it.each([
    ['sexual', 'sexual'],
    ['sexual/minors', 'minors'],
    ['harassment', 'hate'],
    ['harassment/threatening', 'hate'],
    ['hate', 'hate'],
    ['hate/threatening', 'hate'],
    ['illicit', 'illicit'],
    ['illicit/violent', 'illicit'],
    ['self-harm', 'self_harm'],
    ['self-harm/intent', 'self_harm'],
    ['self-harm/instructions', 'self_harm'],
    ['violence', 'violence'],
    ['violence/graphic', 'violence'],
  ])('maps %s to %s', (name, category) => {
    expect(safetyCategory([name])).toBe(category);
  });

  it('ignores case, and reads - and _ alike', () => {
    expect(safetyCategory(['SEXUAL/Minors'])).toBe('minors');
    expect(safetyCategory(['Self_Harm'])).toBe('self_harm');
    expect(safetyCategory(['self-harm'])).toBe('self_harm');
  });

  it.each([
    [['violence', 'sexual/minors', 'hate'], 'minors'],
    [['sexual', 'violence'], 'sexual'],
    [['violence', 'self-harm', 'hate', 'illicit'], 'violence'],
    [['hate', 'self-harm'], 'self_harm'],
    [['illicit', 'harassment'], 'hate'],
    [['illicit/violent', 'illicit'], 'illicit'],
  ])('picks by priority for %j: %s', (names, category) => {
    expect(safetyCategory(names)).toBe(category);
  });

  it('does not depend on the order of the names', () => {
    expect(safetyCategory(['sexual', 'sexual/minors'])).toBe('minors');
    expect(safetyCategory(['sexual/minors', 'sexual'])).toBe('minors');
  });

  it.each([[[]], [['']], [['something-new']], [['constructor']], [['__proto__']], [['toString']]])(
    'is unknown for %j',
    (names) => {
      expect(safetyCategory(names)).toBe('unknown');
    },
  );

  it('keeps a known category when unknown names come with it', () => {
    expect(safetyCategory(['constructor', 'hate'])).toBe('hate');
  });
});

describe('moderationStage', () => {
  it.each(['output', 'OUTPUT', ' output ', 'Output\n'])('is output for %j', (stage) => {
    expect(moderationStage(stage)).toBe('output');
  });

  it.each(['input', 'unknown', 'outputs', '', null, undefined])('is input for %s', (stage) => {
    expect(moderationStage(stage)).toBe('input');
  });
});

describe('moderationRefusal', () => {
  it('names the category of the flagged names', () => {
    expect(moderationRefusal(['sexual/minors'])).toBe('moderation:minors');
    expect(moderationRefusal([])).toBe('moderation:unknown');
  });
});
