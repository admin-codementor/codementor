// Writes docs/ACCESS_MATRIX.md from src/config/accessMatrix.js, so the readable table can never drift from what the tests check.
//   npm run docs:access
const fs = require('fs');
const path = require('path');
const { rules, publicRoutes, invariants, ANY } = require('../src/config/accessMatrix');

const who = (roles) => (roles === ANY ? 'any signed-in role' : roles.join(', '));
const cell = (s) => String(s || '').replaceAll('|', '\\|');

const lines = [
  '# Access matrix: who may call which API route',
  '',
  '**Generated** from `backend/src/config/accessMatrix.js` by `npm run docs:access` in `backend/`. Do not edit by hand: change the matrix and regenerate.',
  '',
  'The test `backend/tests/pure/accessMatrix.js` reads the real role checks on every route and fails the build if a route is missing from this',
  'policy, differs from it, or breaks an invariant below. This covers the **route layer** (who passes sign-in and role checks). Checks inside a',
  'handler (own data only, own department, own class) are not shown here.',
  '',
  'Rules are read top to bottom and the first match wins. `*` is one path segment, `**` is the rest.',
  '',
  '## Routes that need a token',
  '',
  '| Path | Methods | Who may call it | Why |',
  '|---|---|---|---|',
  ...rules.map((r) => `| \`${r.path}\` | ${r.methods ? r.methods.join(', ') : 'all'} | ${who(r.roles)} | ${cell(r.note)} |`),
  '',
  '## Routes open without a token (on purpose)',
  '',
  '| Path | Methods | Why |',
  '|---|---|---|',
  ...publicRoutes.map((r) => `| \`${r.path}\` | ${r.methods ? r.methods.join(', ') : 'all'} | ${cell(r.note)} |`),
  '',
  '## Invariants (true however the rules are edited)',
  '',
  ...invariants.map((i) => `- **${i.id}**: ${i.text}`),
  '',
];

const out = path.join(__dirname, '..', '..', 'docs', 'ACCESS_MATRIX.md');
fs.writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out}`);
