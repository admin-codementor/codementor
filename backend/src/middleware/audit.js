const auditLogRepo = require('../repositories/auditLogRepository');

// Fire-and-forget audit logger. Records a sensitive action without ever
// affecting the request flow — failures are swallowed and logged to the console.
//
//   logAction(req, 'plagiarism.run', `assignment ${id}`)
function logAction(req, action, detail) {
  const userId = req?.user?.id || null;
  const ip = (req?.ip || req?.socket?.remoteAddress || '').slice(0, 64);
  auditLogRepo.create({
    userId, action: String(action).slice(0, 60),
    detail: detail ? String(detail).slice(0, 500) : null, ip,
  }).catch(e => console.error('Audit log failed:', e.message));
}

module.exports = { logAction };
