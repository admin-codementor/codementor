// "Report a problem": a person sends it from an error screen; the Admin reads it and marks it seen or resolved.
const reportRepo = require('../repositories/problemReportRepository');
const userRepo = require('../repositories/userRepository');
const { validateReport, validateStatus } = require('../utils/problemReport');

class ReportError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function submit(user, body) {
  const v = validateReport(body);
  if (v.error) throw new ReportError(400, 'INVALID', v.error);
  const id = await reportRepo.create({ ...v.value, userId: user.id, role: user.role });
  return { id, requestId: v.value.requestId };
}

async function list(status) {
  if (status && !validateStatus(status).value) throw new ReportError(400, 'INVALID', 'Unknown status.');
  const rows = await reportRepo.list(status || undefined);
  const people = await userRepo.getAllUsersMap();
  return rows.map((r) => ({
    id: r.id, at_ms: r.atMs, status: r.status, request_id: r.requestId || null, page: r.page || '', message: r.message || '', code: r.code || null, http_status: r.httpStatus ?? null,
    user_id: r.userId, role: r.role, user_name: people.get(r.userId)?.name || null, user_email: people.get(r.userId)?.email || null,
  }));
}

async function setStatus(adminId, id, status) {
  const v = validateStatus(status);
  if (v.error) throw new ReportError(400, 'INVALID', v.error);
  if (!(await reportRepo.get(id))) throw new ReportError(404, 'NOT_FOUND', 'Report not found.');
  await reportRepo.setStatus(id, v.value, adminId);
  return { id, status: v.value };
}

module.exports = { ReportError, submit, list, setStatus };
