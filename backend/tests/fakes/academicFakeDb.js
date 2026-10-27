// An in-memory stand-in for the academic structure's storage and the staff and student records (no network, no Firestore).
// Installing it replaces functions on the repository modules; services call them as `repo.fn(...)`, so the replacement is seen.
const academicRepo = require('../../src/repositories/academicRepository');
const userRepo = require('../../src/repositories/userRepository');

function createAcademicFakeDb() {
  const db = { terms: new Map(), classes: new Map(), enrollments: new Map(), assignments: new Map(), requests: new Map(), users: new Map(), seq: 0 };
  const id = (p) => `${p}${(db.seq += 1)}`;
  const clone = (v) => (v == null ? v : structuredClone(v));
  const addUser = (u) => { db.users.set(u.id, { ...u }); return u; };
  const students = () => [...db.users.values()].filter((u) => u.role === 'student');

  function install() {
    Object.assign(userRepo, {
      getById: async (uid, role) => { const u = db.users.get(uid); if (!u) return null; if (role === 'student' && u.role !== 'student') return null; if (role === 'faculty' && u.role === 'student') return null; return clone(u); },
      listByRole: async (role) => [...db.users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')).map(clone),
      update: async (uid, role, partial) => { const u = db.users.get(uid); if (u) Object.assign(u, partial); },
    });
    Object.assign(academicRepo, {
      listTerms: async () => [...db.terms.values()].map(clone),
      getTerm: async (tid) => clone(db.terms.get(tid) || null),
      getActiveTerm: async () => clone([...db.terms.values()].find((t) => t.status === 'active') || null),
      createTerm: async (data) => { const t = { id: id('term'), ...data }; db.terms.set(t.id, t); return clone(t); },
      updateTerm: async (tid, partial) => { Object.assign(db.terms.get(tid), partial); },
      listClasses: async (termId, { department } = {}) => [...db.classes.values()].filter((c) => c.termId === termId && (!department || c.department === department)).map(clone),
      getClass: async (cid) => clone(db.classes.get(cid) || null),
      listClassesByStaff: async (sid) => [...db.classes.values()].filter((c) => (c.staffIds || []).includes(sid)).map(clone),
      createClassIfMissing: async (cid, data) => {
        const created = !db.classes.has(cid);
        if (created) db.classes.set(cid, { id: cid, ...data, classTeacherId: data.classTeacherId ?? null, subMentors: data.subMentors ?? [] });
        return { created, class: clone(db.classes.get(cid)) };
      },
      updateClass: async (cid, partial) => { Object.assign(db.classes.get(cid), clone(partial)); },
      listEnrollmentsForTerm: async (termId) => [...db.enrollments.values()].filter((e) => e.termId === termId).map(clone),
      listEnrollmentsForClass: async (cid) => [...db.enrollments.values()].filter((e) => e.classId === cid).map(clone),
      listEnrollmentsForStudent: async (termId, sid) => [...db.enrollments.values()].filter((e) => e.termId === termId && e.studentId === sid).map(clone),
      enroll: async (e) => {
        if (e.primary) for (const [k, v] of db.enrollments) if (v.termId === e.termId && v.studentId === e.studentId && v.primary && v.classId !== e.classId) db.enrollments.delete(k);
        db.enrollments.set(`${e.classId}_${e.studentId}`, { ...db.enrollments.get(`${e.classId}_${e.studentId}`), ...e, primary: !!e.primary });
      },
      enrollBulk: async (list) => { for (const e of list) db.enrollments.set(`${e.classId}_${e.studentId}`, { ...e, primary: !!e.primary }); },
      setEnrollmentPosition: async (cid, sid, position) => { Object.assign(db.enrollments.get(`${cid}_${sid}`), { position }); },
      unenroll: async (cid, sid) => { db.enrollments.delete(`${cid}_${sid}`); },
      listAssignments: async ({ termId, classId, facultyId } = {}) => [...db.assignments.values()].filter((a) => (!termId || a.termId === termId) && (!classId || a.classId === classId) && (!facultyId || a.facultyId === facultyId)).map(clone),
      getAssignment: async (aid) => clone(db.assignments.get(aid) || null),
      createAssignment: async (data) => { const a = { id: id('asg'), ...data, to: data.to ?? null }; db.assignments.set(a.id, a); return clone(a); },
      endAssignment: async (aid, to, endedBy) => { Object.assign(db.assignments.get(aid), { to, endedBy }); },
      reallocate: async ({ endId, endAt, endedBy, next }) => {
        Object.assign(db.assignments.get(endId), { to: endAt, endedBy });
        const a = { id: id('asg'), ...next, to: null }; db.assignments.set(a.id, a); return clone(a);
      },
      createRequest: async (data) => { const r = { id: id('req'), ...data, status: 'pending' }; db.requests.set(r.id, r); return clone(r); },
      getRequest: async (rid) => clone(db.requests.get(rid) || null),
      listRequests: async ({ facultyId, department, status } = {}) => [...db.requests.values()].filter((r) => (!facultyId || r.facultyId === facultyId) && (!department || r.department === department) && (!status || r.status === status)).map(clone),
      decideRequest: async (rid, partial) => { Object.assign(db.requests.get(rid), partial); },
    });
  }
  return { db, install, addUser, students };
}

module.exports = { createAcademicFakeDb };
