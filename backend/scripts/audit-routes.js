// Prints every route and whether it needs a token.
//
//   npm run check:routes
//
// Exits non-zero if any route is open without a `publicRoute(reason)`
// declaration, so it can gate a deploy on its own. The same check runs as part
// of the smoke suite; this script exists so the open surface can be reviewed by
// reading one table instead of twenty route files.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { routeTable } = require('../tests/routeAudit');

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' };

const rows = routeTable().sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const open = rows.filter((r) => !r.guarded);
const undeclared = open.filter((r) => !r.publicReason);

console.log(`${C.bold}Route authorization${C.reset}`);
console.log(`${C.dim}${rows.length} routes — ${rows.length - open.length} require a token, ${open.length} do not${C.reset}\n`);

console.log(`${C.bold}Open without a token${C.reset}`);
for (const r of open) {
  const tag = r.publicReason ? `${C.green}declared${C.reset}` : `${C.red}UNDECLARED${C.reset}`;
  console.log(`  ${tag}  ${r.method.padEnd(6)} ${r.path}`);
  if (r.publicReason) console.log(`            ${C.dim}${r.publicReason}${C.reset}`);
}

if (undeclared.length > 0) {
  console.log(`\n${C.red}${C.bold}${undeclared.length} route(s) are reachable without a token and do not say why.${C.reset}`);
  console.log('Add `protect`, or declare it: publicRoute(\'<reason>\') as the first handler.');
  process.exit(1);
}

console.log(`\n${C.green}${C.bold}Every open route is declared.${C.reset}`);
process.exit(0);
