// One calendar from the things that have dates: assignment deadlines, exam windows and course unit due dates.
// Pure: callers pass plain records and a viewer kind; nothing here reads a database.

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const iso = (ms) => new Date(ms).toISOString();

/**
 * @param {object} a
 * @param {{id,title,deadline,proctored?,isExam?}[]} a.assignments
 * @param {{id,title,windowStart,windowEnd}[]} a.exams
 * @param {{id,title,dueAt,opensAt?,courseId,courseTitle}[]} a.units
 * @param {'student'|'staff'} a.viewer  decides where an event links to
 * @param {number} a.from  ms, inclusive
 * @param {number} a.to    ms, exclusive
 */
function buildCalendarEvents({ assignments = [], exams = [], units = [], viewer, from, to }) {
  const staff = viewer === 'staff';
  const events = [];
  const within = (ms) => ms && ms >= from && ms < to;

  for (const a of assignments) {
    const at = toMillis(a.deadline);
    if (!within(at)) continue;
    events.push({
      key: `assignment:${a.id}`, type: (a.proctored ?? a.isExam) ? 'exam_assignment' : 'assignment', title: a.title, at: iso(at), endAt: null,
      detail: 'Deadline', href: staff ? `/faculty/assignments/${a.id}/edit` : '/app/assignments',
    });
  }
  for (const e of exams) {
    const start = toMillis(e.windowStart);
    const end = toMillis(e.windowEnd);
    if (!within(start) && !within(end)) continue;
    events.push({
      key: `exam:${e.id}`, type: 'exam', title: e.title, at: iso(start || end), endAt: end ? iso(end) : null,
      detail: end ? 'Exam window' : 'Exam', href: staff ? `/faculty/exams/${e.id}/edit` : `/app/exams/${e.id}`,
    });
  }
  for (const u of units) {
    const due = toMillis(u.dueAt);
    if (within(due)) {
      events.push({
        key: `unit-due:${u.courseId}:${u.id}`, type: 'unit_due', title: u.title, at: iso(due), endAt: null,
        detail: `Due · ${u.courseTitle}`, href: staff ? `/faculty/courses/${u.courseId}` : `/app/courses/${u.courseId}?module=${u.id}`,
      });
    }
    const opens = toMillis(u.opensAt);
    if (within(opens)) {
      events.push({
        key: `unit-open:${u.courseId}:${u.id}`, type: 'unit_opens', title: u.title, at: iso(opens), endAt: null,
        detail: `Opens · ${u.courseTitle}`, href: staff ? `/faculty/courses/${u.courseId}` : `/app/courses/${u.courseId}?module=${u.id}`,
      });
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title));
}

/** Parses the requested range; defaults to the current month and never allows more than about three months. */
function parseRange(fromStr, toStr, now = Date.now()) {
  const MAX = 100 * 86400000;
  const d = new Date(now);
  const defFrom = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  let from = fromStr ? new Date(fromStr).getTime() : defFrom;
  let to = toStr ? new Date(toStr).getTime() : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  if (!Number.isFinite(from)) from = defFrom;
  if (!Number.isFinite(to) || to <= from) to = from + 31 * 86400000;
  if (to - from > MAX) to = from + MAX;
  return { from, to };
}

module.exports = { buildCalendarEvents, parseRange };
