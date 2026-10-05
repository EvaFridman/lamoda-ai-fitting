// Conventional Commits with the types and scopes from specs/0001-bootstrap/clarifications.md (A5).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'perf',
        'refactor',
        'style',
        'test',
        'docs',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-empty': [2, 'never'],
    'scope-enum': [
      2,
      'always',
      ['api', 'web', 'infra', 'deploy', 'ci', 'deps', 'docs', 'specs', 'tooling'],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
};
