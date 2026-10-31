const fs = require('fs');
const edit = (p, pairs) => {
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`missing in ${p}: ${a.slice(0, 70)}`);
    t = t.replace(a, () => b);
  }
  fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t);
};
edit('src/utils/problemReport.js', [
  ["  const status = Number.isInteger(input.status) && input.status >= 100 && input.status <= 599 ? input.status : null;", "  const httpStatus = Number.isInteger(input.status) && input.status >= 100 && input.status <= 599 ? input.status : null;"],
  ["  return { value: { requestId, page, message, code, status } };", "  return { value: { requestId, page, message, code, httpStatus } };"],
  ["{requestId: string|null, page: string, message: string, code: string|null, status: number|null}", "{requestId: string|null, page: string, message: string, code: string|null, httpStatus: number|null}"],
]);
edit('src/services/problemReportService.js', [["http_status: r.status_code ?? null", "http_status: r.httpStatus ?? null"]]);
console.log('ok');
