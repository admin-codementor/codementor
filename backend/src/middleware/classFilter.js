// The dashboard's class switcher: `?classId=<id>` narrows every faculty analytics call to one class.
//
// The class must be one the caller may look at (their own classroom, an academic class they teach, are class teacher or sub-mentor of, or
// hold access to; a HOD: any class of their department; an Admin: any). When it is not, the request is refused: it is never quietly
// widened to everything the person can see. `classId=all` or none means no narrowing. The result is left on `req.classFilter`, which
// analyticsService.resolveAnalyticsScope reads.
const academicScope = require('../services/academicScope');

module.exports = async function classFilter(req, res, next) {
  const raw = req.query?.classId;
  if (raw === undefined || raw === '' || raw === 'all') return next();
  if (typeof raw !== 'string') return res.status(400).json({ success: false, code: 'BAD_CLASS', error: 'Choose one class.' });
  try {
    const r = await academicScope.resolveClassMembers(req.user, raw);
    if (!r.ok) return res.status(r.status).json({ success: false, code: r.code, error: r.error });
    req.classFilter = { classId: raw, memberIds: r.memberIds, label: r.label, kind: r.kind };
    return next();
  } catch (e) {
    return next(e);
  }
};
